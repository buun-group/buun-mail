#!/usr/bin/env node
/**
 * Publishes a signed Android App Bundle to a Google Play track, or moves the release already on one track to another.
 * Used by mobile-android.yml and mobile-play-promote.yml, and works the same from a laptop.
 *
 *   node tools/play-ship.mjs --aab app-universal-release.aab --track internal --name 0.6.0-beta.2 --notes "What changed"
 *   node tools/play-ship.mjs --aab app.aab --dry-run                  signs in and reads the tracks, publishes nothing
 *   node tools/play-ship.mjs --promote-from internal --track alpha    no upload: the internal release, on closed testing
 *   node tools/play-ship.mjs --aab app.aab --track beta --hold-for-review   saved, sent to Google's review by hand
 *
 * Tracks: internal (no review), alpha (closed testing), beta (open testing) and production. Google reviews every
 * track but internal, so testers there see a release once that passes.
 *
 * The bundle carries its own version: the build stamps the name and the version code (tools/mobile-version.mjs,
 * minutes since 2020-01-01 UTC, so it always rises). `--name` is the release's name in Play Console, the app version
 * by convention; without it the release is named after its version code.
 *
 * The service-account key comes from `--key <file>`, else the PLAY_SERVICE_ACCOUNT_JSON environment variable (the
 * JSON itself, or a path to it), else ~/.config/buun-mail/play-service-account.json. It is never printed.
 *
 * Package com.buungroup.mail. No dependencies: Google's OAuth JWT is signed with node:crypto and the Play Developer
 * API is plain REST.
 */
import { createSign } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  holdsForReview,
  isAutoReviewError,
  isDraftAppError,
  isReviewHoldError,
  latestRelease,
  parseArgs,
  parseServiceAccount,
  releaseNotes,
  sameCodes,
} from './play-versions.mjs'

/** The app's Android package name. */
export const PACKAGE = 'com.buungroup.mail'

const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications'
const UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications'
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher'
const TOKEN_URI = 'https://oauth2.googleapis.com/token'
const DEFAULT_KEY = join(homedir(), '.config', 'buun-mail', 'play-service-account.json')
const SETUP = 'docs/mobile.md, "Google Play, once"'

const say = (line = '') => process.stdout.write(`${line}\n`)

/** Stops with one message, as a GitHub annotation too when in Actions. */
function fail(message) {
  if (process.env.GITHUB_ACTIONS) say(`::error title=Google Play::${message.split('\n')[0]}`)
  process.stderr.write(`\nError: ${message}\n\n`)
  process.exit(1)
}

/* --- The key -------------------------------------------------------------------------------------------------- */

/** Where the key is and its text: a file named on the command line, the environment variable, or the default file. */
export function keySource(flag, env = process.env) {
  if (flag) return { where: flag, text: readIfThere(flag) }
  const fromEnv = (env.PLAY_SERVICE_ACCOUNT_JSON ?? '').trim()
  if (fromEnv.startsWith('{')) return { where: 'PLAY_SERVICE_ACCOUNT_JSON', text: fromEnv }
  if (fromEnv) return { where: fromEnv, text: readIfThere(fromEnv) }
  return { where: DEFAULT_KEY, text: readIfThere(DEFAULT_KEY) }
}

function readIfThere(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null
}

/* --- Google sign-in (service-account JWT for an access token) ------------------------------------------------- */

const b64url = (value) => Buffer.from(value).toString('base64url')

/** The signed assertion Google trades for an access token. Exported for the tests. */
export function serviceAccountJwt(key, now = Date.now()) {
  const iat = Math.floor(now / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({ iss: key.client_email, scope: SCOPE, aud: key.token_uri ?? TOKEN_URI, iat, exp: iat + 3600 }))
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${claims}`)
  return `${header}.${claims}.${signer.sign(key.private_key).toString('base64url')}`
}

async function accessToken(key) {
  const res = await fetch(key.token_uri ?? TOKEN_URI, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: serviceAccountJwt(key) }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) fail(`Google sign-in failed: ${body.error_description ?? body.error ?? res.status}. Check the key is current (Google Cloud, IAM, Service accounts, Keys).`)
  return body.access_token
}

/* --- Play Developer API --------------------------------------------------------------------------------------- */

/** One Play API call. With `soft`, a failure comes back as `{ failed, status }` for the caller to handle. */
async function play(token, method, url, body, { soft = false, headers = {} } = {}) {
  const binary = body instanceof Uint8Array
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body && !binary ? { 'content-type': 'application/json' } : {}), ...headers },
    body: binary ? body : body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = {}
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    json = {}
  }
  if (res.ok) return json
  const message = json.error?.message ?? text
  if (soft) return { failed: message, status: res.status }
  if (res.status === 401 || res.status === 403) {
    fail(
      `Play refused (${res.status}): ${message}\n` +
        '  The service account must be invited in Play Console, Users and permissions, with release rights for\n' +
        `  ${PACKAGE}. A new permission can take a few minutes to apply. Setup: ${SETUP}.`,
    )
  }
  if (res.status === 404 && url.includes(`/${PACKAGE}/edits`) && method === 'POST' && !url.includes(':commit')) {
    fail(`Play has no app ${PACKAGE} (404). Create it in Play Console and upload the first bundle by hand. Setup: ${SETUP}.`)
  }
  if (isDraftAppError(message)) failDraft(message)
  fail(`Play API ${method} ${url.replace(API, '').replace(UPLOAD, '')} failed (${res.status}): ${message}`)
  return json
}

function failDraft(message) {
  fail(
    `${message}\n` +
      '  Play treats this app as a draft until its setup in Play Console is finished, and then accepts only draft\n' +
      '  releases. Finish the Dashboard tasks (App content, store listing, countries) and do the first release on\n' +
      `  this track by hand. After that this publishes on its own. Setup: ${SETUP}.`,
  )
}

/**
 * Commits an edit. Play sometimes insists the changes are held back from automatic review; they are then saved and
 * sent for review by hand, rather than the whole publish failing. Returns whether the changes were held.
 */
async function commitEdit(token, editId, hold) {
  const url = `${API}/${PACKAGE}/edits/${editId}:commit`
  const failCommit = (result) => {
    if (isDraftAppError(result.failed)) failDraft(result.failed)
    fail(`Play API commit failed (${result.status}): ${result.failed}`)
  }
  if (hold) {
    const held = await play(token, 'POST', `${url}?changesNotSentForReview=true`, undefined, { soft: true })
    if (!held.failed) return true
    if (!isAutoReviewError(held.failed)) failCommit(held)
    say('  Play sends this app\'s changes to review automatically, so this one cannot be held back. Sending it normally.')
  }
  const committed = await play(token, 'POST', url, undefined, { soft: true })
  if (!committed.failed) return false
  if (!isReviewHoldError(committed.failed)) failCommit(committed)
  await play(token, 'POST', `${url}?changesNotSentForReview=true`)
  return true
}

function reportDone(label, track, held) {
  if (held) {
    say(`\nSaved: ${label} on the ${track} track, NOT yet sent for review.`)
    say('Play Console, Publishing overview, Send changes for review. Testers see it once Google approves.\n')
  } else if (track === 'internal') {
    say(`\nDone: ${label} is live on the internal track. Testers get it from the Play Store within minutes.\n`)
  } else {
    say(`\nDone: ${label} is submitted to the ${track} track. Google reviews it first; testers see it once that passes.\n`)
  }
}

/* --- Promote -------------------------------------------------------------------------------------------------- */

/** Puts the newest release on one track onto another, with no upload: the same bundle, so the two never differ. */
async function promote(token, args) {
  const edit = await play(token, 'POST', `${API}/${PACKAGE}/edits`, {})
  const discard = () => play(token, 'DELETE', `${API}/${PACKAGE}/edits/${edit.id}`, undefined, { soft: true })
  const listed = await play(token, 'GET', `${API}/${PACKAGE}/edits/${edit.id}/tracks`)
  const tracks = listed.tracks ?? []
  const source = latestRelease(tracks, args.promoteFrom)
  if (!source) {
    await discard()
    fail(`Nothing is released on the ${args.promoteFrom} track yet, so there is nothing to promote.`)
  }
  const label = `${source.name ?? 'release'} (code ${source.versionCodes.join(', ')})`
  const there = latestRelease(tracks, args.track)
  if (there && sameCodes(there.versionCodes, source.versionCodes)) {
    await discard()
    say(`\n${label} is already the newest release on the ${args.track} track. Nothing to do.\n`)
    return
  }
  if (args.dryRun) {
    await discard()
    say(`\nDry run: would put ${label} from ${args.promoteFrom} on the ${args.track} track.\n`)
    return
  }
  say(`\n> Promoting ${label} from ${args.promoteFrom} to ${args.track}`)
  const notes = args.notes ? releaseNotes(args.notes, '', args.notesLanguage) : source.releaseNotes?.length ? source.releaseNotes : releaseNotes('', `Build ${label}`, args.notesLanguage)
  await play(token, 'PUT', `${API}/${PACKAGE}/edits/${edit.id}/tracks/${args.track}`, {
    track: args.track,
    releases: [{ name: source.name, versionCodes: source.versionCodes, status: 'completed', releaseNotes: notes }],
  })
  reportDone(label, args.track, await commitEdit(token, edit.id, holdsForReview(args.track, args.hold)))
}

/* --- Upload --------------------------------------------------------------------------------------------------- */

async function upload(token, args) {
  const aab = resolve(args.aab)
  if (!existsSync(aab)) fail(`No bundle at ${aab}. Build it first: pnpm build:android --aab (signed, see docs/mobile.md).`)
  say(`  Bundle ${aab} (${(statSync(aab).size / 1e6).toFixed(1)} MB)`)

  const edit = await play(token, 'POST', `${API}/${PACKAGE}/edits`, {})
  const listed = await play(token, 'GET', `${API}/${PACKAGE}/edits/${edit.id}/tracks`)
  const onTrack = (listed.tracks ?? []).find((each) => each.track === args.track)?.releases?.length ?? 0
  say(`  ${args.track} track: ${onTrack ? `${onTrack} release(s)` : 'nothing released yet'}`)
  if (args.dryRun) {
    await play(token, 'DELETE', `${API}/${PACKAGE}/edits/${edit.id}`, undefined, { soft: true })
    say('\nDry run: Play accepted the key and the app is there. Nothing was uploaded.\n')
    return
  }

  say(`\n> Uploading to the ${args.track} track`)
  const uploaded = await play(token, 'POST', `${UPLOAD}/${PACKAGE}/edits/${edit.id}/bundles?uploadType=media`, new Uint8Array(readFileSync(aab)), {
    headers: { 'content-type': 'application/octet-stream' },
  })
  const code = String(uploaded.versionCode)
  const name = args.name || `Build ${code}`
  await play(token, 'PUT', `${API}/${PACKAGE}/edits/${edit.id}/tracks/${args.track}`, {
    track: args.track,
    releases: [{ name, versionCodes: [code], status: 'completed', releaseNotes: releaseNotes(args.notes, `Buun Mail ${name}`, args.notesLanguage) }],
  })
  reportDone(`${name} (code ${code})`, args.track, await commitEdit(token, edit.id, holdsForReview(args.track, args.hold)))
}

/* --- Main ----------------------------------------------------------------------------------------------------- */

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }
  const source = keySource(args.key)
  if (source.text === null) fail(`No Play service-account key at ${source.where}. Set PLAY_SERVICE_ACCOUNT_JSON or pass --key. Setup: ${SETUP}.`)
  let key
  try {
    key = parseServiceAccount(source.text, source.where)
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }
  say('> Signing in to Google Play')
  const token = await accessToken(key)
  if (args.promoteFrom) await promote(token, args)
  else await upload(token, args)
}
