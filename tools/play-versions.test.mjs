import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  NOTES_LIMIT,
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

/** A release with version codes and a status, as the Play API returns it. */
const release = (name, status, ...codes) => ({ name, status, versionCodes: codes.map(String) })

const HOLD_ASKED = 'Changes cannot be sent for review automatically. Please set the query parameter changesNotSentForReview to true.'
const HOLD_REFUSED = 'Changes are sent for review automatically. The query parameter changesNotSentForReview must not be set.'

test('an upload needs a bundle and takes the track, name, notes and switches', () => {
  assert.deepEqual(parseArgs(['--aab', 'a.aab']), { aab: 'a.aab', track: 'internal', promoteFrom: '', name: '', notes: '', notesLanguage: 'en-US', key: '', dryRun: false, hold: false })
  const full = parseArgs(['--aab', 'a.aab', '--track', 'beta', '--name', '0.6.0', '--notes', 'Fixes', '--notes-language', 'en-AU', '--key', 'k.json', '--dry-run', '--hold-for-review'])
  assert.equal(full.track, 'beta')
  assert.equal(full.name, '0.6.0')
  assert.equal(full.notes, 'Fixes')
  assert.equal(full.notesLanguage, 'en-AU')
  assert.equal(full.key, 'k.json')
  assert.equal(full.dryRun, true)
  assert.equal(full.hold, true)
  assert.equal(parseArgs(['--aab', 'a.aab', '--notes', '']).notes, '', 'empty notes fall back to the default later')
})

test('a bad command line is refused with what to fix', () => {
  assert.throws(() => parseArgs([]), /--aab is required/)
  assert.throws(() => parseArgs(['--aab', 'a.aab', '--track', 'open']), /--track must be one of internal, alpha, beta, production/)
  assert.throws(() => parseArgs(['--aab']), /--aab needs a value/)
  assert.throws(() => parseArgs(['--aab', 'a.aab', '--wat']), /Unknown option: --wat/)
})

test('a promote takes no bundle and two different tracks', () => {
  assert.equal(parseArgs(['--promote-from', 'internal', '--track', 'alpha']).promoteFrom, 'internal')
  assert.throws(() => parseArgs(['--promote-from', 'alpha', '--track', 'alpha']), /same track/)
  assert.throws(() => parseArgs(['--promote-from', 'nope', '--track', 'alpha']), /--promote-from must be one of/)
  assert.throws(() => parseArgs(['--promote-from', 'internal', '--track', 'alpha', '--aab', 'a.aab']), /a promote moves the release/)
})

test('latestRelease is null for a track with nothing on it, a missing track or no tracks', () => {
  assert.equal(latestRelease([], 'internal'), null)
  assert.equal(latestRelease(undefined, 'internal'), null)
  assert.equal(latestRelease([{ track: 'internal' }], 'internal'), null)
  assert.equal(latestRelease([{ track: 'alpha', releases: [release('1.0.1', 'completed', 5)] }], 'internal'), null)
})

test('latestRelease picks the highest version code, comparing numbers not text', () => {
  const tracks = [{ track: 'internal', releases: [release('0.9.0', 'completed', 900), release('0.10.0', 'completed', 1000)] }]
  assert.equal(latestRelease(tracks, 'internal')?.name, '0.10.0')
})

test('latestRelease ignores drafts, rollouts in progress and releases with no code', () => {
  const tracks = [
    {
      track: 'internal',
      releases: [release('0.4.0', 'completed', 400), release('0.5.0', 'draft', 500), release('0.6.0', 'inProgress', 600), { name: '0.7.0', status: 'completed' }],
    },
  ]
  assert.equal(latestRelease(tracks, 'internal')?.name, '0.4.0')
})

test('latestRelease looks only at the track asked for and returns the whole release', () => {
  const notes = [{ language: 'en-US', text: 'hi' }]
  const tracks = [
    { track: 'internal', releases: [release('0.6.0', 'completed', 2000)] },
    { track: 'alpha', releases: [{ ...release('0.5.0', 'completed', 1000, 1001), releaseNotes: notes }] },
  ]
  assert.deepEqual(latestRelease(tracks, 'alpha'), { ...release('0.5.0', 'completed', 1000, 1001), releaseNotes: notes })
})

test('two releases are the same when they carry the same codes in any order', () => {
  assert.equal(sameCodes(['2', '1'], ['1', '2']), true)
  assert.equal(sameCodes(['1'], ['1', '2']), false)
  assert.equal(sameCodes(undefined, []), true)
})

test('release notes fall back, are trimmed to Play\'s limit and carry their language', () => {
  assert.deepEqual(releaseNotes('', 'Buun Mail 0.6.0'), [{ language: 'en-US', text: 'Buun Mail 0.6.0' }])
  assert.deepEqual(releaseNotes(' Fixes ', 'x', 'en-AU'), [{ language: 'en-AU', text: 'Fixes' }])
  assert.equal(releaseNotes('a'.repeat(900), '')[0]?.text.length, NOTES_LIMIT)
})

test('a hold is asked for only on a track Google reviews', () => {
  for (const track of ['alpha', 'beta', 'production']) assert.equal(holdsForReview(track, true), true)
  assert.equal(holdsForReview('internal', true), false)
  for (const track of ['internal', 'alpha', 'beta', 'production']) assert.equal(holdsForReview(track, false), false)
})

test('Play asking for a hold and Play refusing one are told apart', () => {
  assert.equal(isReviewHoldError(HOLD_ASKED), true)
  assert.equal(isAutoReviewError(HOLD_ASKED), false)
  assert.equal(isAutoReviewError(HOLD_REFUSED), true)
  assert.equal(isReviewHoldError(HOLD_REFUSED), false)
  assert.equal(isReviewHoldError('Version code 123 has already been used.'), false)
  assert.equal(isAutoReviewError(undefined), false)
})

test('the draft app error is recognised', () => {
  assert.equal(isDraftAppError('Only releases with status draft may be created on draft app.'), true)
  assert.equal(isDraftAppError('APK specifies a version code that has already been used.'), false)
})

test('a service-account key is checked without ever echoing it', () => {
  const key = parseServiceAccount(JSON.stringify({ client_email: 'ci@x.iam.gserviceaccount.com', private_key: 'PEM' }), 'PLAY_SERVICE_ACCOUNT_JSON')
  assert.equal(key.client_email, 'ci@x.iam.gserviceaccount.com')
  assert.throws(() => parseServiceAccount('secret-looking-text', 'PLAY_SERVICE_ACCOUNT_JSON'), (error) => error instanceof Error && /is not JSON/.test(error.message) && !error.message.includes('secret-looking-text'))
  assert.throws(() => parseServiceAccount('{"type":"authorized_user"}', 'k.json'), /k\.json is not a service-account key/)
})
