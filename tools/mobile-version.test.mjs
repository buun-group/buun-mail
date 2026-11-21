import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { EPOCH_MS, androidConfig, iosConfig, numericCore, versionCode, versionOf } from './mobile-version.mjs'

const SCRIPT = join(import.meta.dirname, 'mobile-version.mjs')
const AT = Date.UTC(2026, 10, 21, 12, 0)

test('a tag gives its version, and anything else is refused with the reason', () => {
  assert.equal(versionOf('v0.6.0'), '0.6.0')
  assert.equal(versionOf('v0.6.0-beta.10'), '0.6.0-beta.10')
  assert.equal(versionOf('1.2.3'), '1.2.3')
  assert.throws(() => versionOf('android-beta'), /not a version tag/)
  assert.throws(() => versionOf(''), /not a version tag/)
  assert.throws(() => versionOf('v1.2'), /not a version tag/)
})

test('iOS gets only the numeric core of a beta', () => {
  assert.equal(numericCore('0.6.0-beta.10'), '0.6.0')
  assert.equal(numericCore('1.10.3'), '1.10.3')
})

test('the version code is the minutes since 2020-01-01 UTC, so it only rises', () => {
  assert.equal(versionCode(EPOCH_MS), 0)
  assert.equal(versionCode(EPOCH_MS + 59_999), 0)
  assert.equal(versionCode(EPOCH_MS + 60_000), 1)
  assert.ok(versionCode(AT) > 3_000_000 && versionCode(AT) < 4_000_000)
  assert.ok(versionCode(AT + 60_000) > versionCode(AT))
})

test('the Android config keeps the whole version as its name', () => {
  assert.deepEqual(androidConfig('v0.6.0-beta.10', { now: AT }), { version: '0.6.0-beta.10', bundle: { android: { versionCode: versionCode(AT) } } })
  assert.equal(androidConfig('v0.6.0', { build: '42' }).bundle.android.versionCode, 42)
  assert.throws(() => androidConfig('v0.6.0', { build: '0' }), /outside 1 to/)
  assert.throws(() => androidConfig('v0.6.0', { build: 'x' }), /whole number/)
})

test('the iOS config is X.Y.Z with the build number apart, plus the offset', () => {
  assert.deepEqual(iosConfig('v0.6.0-beta.10', { now: AT }), { version: '0.6.0', bundle: { iOS: { bundleVersion: String(versionCode(AT)) } } })
  assert.equal(iosConfig('v0.6.0', { build: '7', offset: '100' }).bundle.iOS.bundleVersion, '107')
  assert.throws(() => iosConfig('v0.6.0', { offset: '-1' }), /whole number/)
})

test('the command prints the config and writes it to GITHUB_OUTPUT', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mobile-version-'))
  try {
    const out = join(dir, 'out')
    writeFileSync(out, '')
    const printed = execFileSync('node', [SCRIPT, 'ios', 'v0.6.0-beta.3', '--build', '12', '--offset', ''], { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: out } })
    assert.deepEqual(JSON.parse(printed), { version: '0.6.0', bundle: { iOS: { bundleVersion: '12' } } })
    assert.equal(readFileSync(out, 'utf8'), `config=${printed.trim()}\nversion=0.6.0\nbuild=12\n`)
    assert.throws(() => execFileSync('node', [SCRIPT, 'windows', 'v1.0.0'], { stdio: 'pipe' }))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
