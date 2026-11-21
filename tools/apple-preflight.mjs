#!/usr/bin/env node
/**
 * The Apple credentials check for .github/workflows/mobile-ios.yml. Runs before the Mac starts, and fails in
 * seconds with the reason in plain words when Apple would refuse the signed build or the TestFlight upload: a
 * rejected API key, no registered device, a missing App ID or app record, a stored certificate that is half set up.
 * Read-only: it only GETs from the App Store Connect API. Secrets come from the environment and are never printed.
 *
 *   KEY_ID, ISSUER, KEY     the API key's id, the issuer id and the .p8 (base64)
 *   TEAM                    the Team ID, checked against the App ID prefix
 *   DIST_P12, DIST_PASSWORD, APP_PROFILE
 *                           the stored-certificate secrets (base64 .p12, its password, the App Store profile); with
 *                           DIST_P12 set the build signs from them, without it automatically with the API key
 *   BUNDLE_ID               default com.buungroup.mail
 */
import { appendFileSync } from 'node:fs'

import { API_BASE, BUNDLE_ID, appStoreToken, checkApple, checkSigningSecrets, hasErrors, privateKeyPem, summaryMarkdown } from './apple-checks.mjs'

const env = process.env
const say = (line = '') => process.stdout.write(`${line}\n`)

function show(each) {
  const tag = { ok: 'OK   ', warn: 'CHECK', error: 'FIX  ' }[each.level]
  say(`${tag} ${each.title}`)
  if (each.detail) say(`      ${each.detail}`)
  if (each.level !== 'ok') say(`::${each.level === 'error' ? 'error' : 'warning'} title=${each.title}::${each.detail || each.title}`)
}

function fail(message) {
  say(`::error title=Apple credentials::${message}`)
  process.stderr.write(`\nError: ${message}\n\n`)
  process.exit(1)
}

const NAMES = { KEY_ID: 'APP_STORE_CONNECT_KEY_ID', ISSUER: 'APP_STORE_CONNECT_ISSUER_ID', KEY: 'APP_STORE_CONNECT_API_KEY_BASE64', TEAM: 'APPLE_TEAM_ID' }
const missing = Object.keys(NAMES).filter((name) => !env[name])
if (missing.length > 0) fail(`Missing secrets: ${missing.map((name) => NAMES[name]).join(', ')}. Add them in Settings, Secrets and variables, Actions (docs/mobile.md).`)

let token
try {
  token = appStoreToken({ keyId: env.KEY_ID, issuerId: env.ISSUER, pem: privateKeyPem(env.KEY) })
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}

async function call(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) })
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}

const bundleId = env.BUNDLE_ID || BUNDLE_ID
const signing = checkSigningSecrets({ p12: env.DIST_P12, password: env.DIST_PASSWORD, profile: env.APP_PROFILE, teamId: env.TEAM ?? '', bundleId })
const findings = [...signing.findings, ...(hasErrors(signing.findings) ? [] : await checkApple({ call, teamId: env.TEAM ?? '', bundleId, manual: signing.manual }))]

say('Apple credentials check\n')
for (const each of findings) show(each)
if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${summaryMarkdown(findings)}\n`)
if (hasErrors(findings)) {
  process.stderr.write('\nFix the lines marked FIX, then run the workflow again. Nothing was built.\n')
  process.exit(1)
}
say('\nApple accepted everything it was asked. Carrying on with the build.')
