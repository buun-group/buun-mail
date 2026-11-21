/**
 * The pure parts of play-ship.mjs: reading the command line, which release a track holds, and how to read a Play
 * error. Split out so they can be tested without a Play account.
 */

/** Google Play's tracks: internal testing, closed testing (alpha), open testing (beta) and production. */
export const TRACKS = ['internal', 'alpha', 'beta', 'production']

/** Play keeps release notes to 500 characters per language. */
export const NOTES_LIMIT = 500

/** The language release notes are written in, unless `--notes-language` names another of the listing's languages. */
export const DEFAULT_NOTES_LANGUAGE = 'en-US'

const USAGE = [
  'usage: node tools/play-ship.mjs --aab <file> [--track internal] [--name 0.6.0] [--notes "..."] [--dry-run]',
  '       node tools/play-ship.mjs --promote-from internal --track alpha   (no upload)',
  'options: --key <service-account.json>, --notes-language en-US, --hold-for-review',
].join('\n')

/**
 * The options from the command line, or throws a sentence saying what is wrong. A promote moves a release that is
 * already on Play, so it takes no bundle; an upload needs one.
 */
export function parseArgs(argv) {
  const out = { aab: '', track: 'internal', promoteFrom: '', name: '', notes: '', notesLanguage: DEFAULT_NOTES_LANGUAGE, key: '', dryRun: false, hold: false }
  const value = (index, flag) => {
    const next = argv[index + 1]
    if (next === undefined || next.startsWith('--')) throw new Error(`${flag} needs a value.\n${USAGE}`)
    return next
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--dry-run') out.dryRun = true
    else if (arg === '--hold-for-review') out.hold = true
    else if (arg === '--aab') out.aab = value(index++, arg)
    else if (arg === '--track') out.track = value(index++, arg)
    else if (arg === '--promote-from') out.promoteFrom = value(index++, arg)
    else if (arg === '--name') out.name = value(index++, arg)
    else if (arg === '--notes') out.notes = argv[++index] ?? ''
    else if (arg === '--notes-language') out.notesLanguage = value(index++, arg)
    else if (arg === '--key') out.key = value(index++, arg)
    else if (arg === '--help' || arg === '-h') throw new Error(USAGE)
    else throw new Error(`Unknown option: ${arg}\n${USAGE}`)
  }
  if (!TRACKS.includes(out.track)) throw new Error(`--track must be one of ${TRACKS.join(', ')}.`)
  if (out.promoteFrom) {
    if (!TRACKS.includes(out.promoteFrom)) throw new Error(`--promote-from must be one of ${TRACKS.join(', ')}.`)
    if (out.promoteFrom === out.track) throw new Error('--promote-from and --track are the same track, so there is nothing to promote.')
    if (out.aab) throw new Error('--aab is for an upload; a promote moves the release already on Play.')
  } else if (!out.aab) {
    throw new Error(`--aab is required, unless --promote-from moves a release already on Play.\n${USAGE}`)
  }
  return out
}

/**
 * The newest completed release on one track (the one whose highest version code is greatest), or null when the
 * track has none. A promote copies this release to another track. Drafts and rollouts in progress are ignored: only
 * a release that reached testers is worth handing on. `tracks` is the `tracks` array of edits.tracks.list.
 */
export function latestRelease(tracks, trackName) {
  const track = (tracks ?? []).find((each) => each.track === trackName)
  let best = null
  let bestCode = -1
  for (const release of track?.releases ?? []) {
    if (release.status !== 'completed') continue
    const codes = (release.versionCodes ?? []).map(Number).filter(Number.isFinite)
    if (codes.length === 0) continue
    const top = Math.max(...codes)
    if (top > bestCode) {
      best = release
      bestCode = top
    }
  }
  return best
}

/** Whether two releases carry the same bundles, whatever order Play lists their version codes in. */
export function sameCodes(a, b) {
  const key = (codes) => [...(codes ?? [])].map(String).sort().join(',')
  return key(a) === key(b)
}

/** Release notes for Play: the text given, else the fallback, cut to Play's limit, in one language. */
export function releaseNotes(text, fallback, language = DEFAULT_NOTES_LANGUAGE) {
  const words = (text || fallback).trim().slice(0, NOTES_LIMIT)
  return [{ language, text: words }]
}

/**
 * Whether a commit should be held back from Google's review until someone sends it from Play Console (Publishing
 * overview, Send changes for review). Asked for with --hold-for-review, and only for a track Google reviews:
 * internal testing has no review to hold.
 */
export function holdsForReview(track, requested) {
  return Boolean(requested) && track !== 'internal'
}

/**
 * Whether a failed commit is Play asking for the changes to be held back from automatic review. The commit is then
 * repeated with changesNotSentForReview and the release is sent for review by hand in Play Console.
 */
export function isReviewHoldError(message) {
  return /changesNotSentForReview/i.test(message ?? '') && !isAutoReviewError(message)
}

/**
 * Whether a failed commit is Play refusing a request to hold the changes back: it sends this app's changes to
 * review automatically, so changesNotSentForReview must not be set.
 */
export function isAutoReviewError(message) {
  return /changesNotSentForReview must not be set/i.test(message ?? '')
}

/** Whether a Play error is the one a new app gives until its first release was made in Play Console by hand. */
export function isDraftAppError(message) {
  return /draft app/i.test(message ?? '')
}

/**
 * The service-account key from its text, checked to be one, or throws. The text is the JSON file itself; nothing of
 * it is ever put in a message.
 */
export function parseServiceAccount(text, where) {
  let key
  try {
    key = JSON.parse(text)
  } catch {
    throw new Error(`${where} is not JSON. It must be the service-account key file Google Cloud downloads, pasted whole.`)
  }
  if (typeof key?.client_email !== 'string' || typeof key?.private_key !== 'string') {
    throw new Error(`${where} is not a service-account key (it has no client_email or private_key).`)
  }
  return key
}
