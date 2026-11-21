import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { generateKeyPairSync, verify } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { PACKAGE, keySource, serviceAccountJwt } from './play-ship.mjs'

const SCRIPT = join(import.meta.dirname, 'play-ship.mjs')
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const KEY = { client_email: 'ci@buun-mail.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }

test('the app is com.buungroup.mail', () => {
  assert.equal(PACKAGE, 'com.buungroup.mail')
})

test('the sign-in token has the claims Google wants and a signature the key verifies', () => {
  const now = 1_800_000_000_000
  const [header, claims, signature] = serviceAccountJwt(KEY, now).split('.')
  const json = (part) => JSON.parse(Buffer.from(part ?? '', 'base64url').toString())
  assert.deepEqual(json(header), { alg: 'RS256', typ: 'JWT' })
  assert.deepEqual(json(claims), {
    iss: KEY.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: 1_800_000_000,
    exp: 1_800_003_600,
  })
  assert.ok(verify('RSA-SHA256', Buffer.from(`${header}.${claims}`), publicKey, Buffer.from(signature ?? '', 'base64url')))
})

test('the key comes from the flag, then the environment as JSON or a path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'play-key-'))
  try {
    const file = join(dir, 'key.json')
    writeFileSync(file, '{"from":"file"}')
    assert.deepEqual(keySource(file, {}), { where: file, text: '{"from":"file"}' })
    assert.deepEqual(keySource('', { PLAY_SERVICE_ACCOUNT_JSON: ' {"from":"env"} ' }), { where: 'PLAY_SERVICE_ACCOUNT_JSON', text: '{"from":"env"}' })
    assert.deepEqual(keySource('', { PLAY_SERVICE_ACCOUNT_JSON: file }), { where: file, text: '{"from":"file"}' })
    assert.equal(keySource(join(dir, 'missing.json'), {}).text, null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the command stops before any network call on a bad command line or a missing or broken key', () => {
  const run = (args, env) => {
    try {
      execFileSync('node', [SCRIPT, ...args], { stdio: 'pipe', encoding: 'utf8', env: { PATH: process.env.PATH, HOME: tmpdir(), ...env } })
      return { code: 0, stderr: '' }
    } catch (error) {
      return { code: error.status, stderr: String(error.stderr) }
    }
  }
  const usage = run([], {})
  assert.equal(usage.code, 1)
  assert.match(usage.stderr, /--aab is required/)
  const noKey = run(['--aab', 'a.aab'], { PLAY_SERVICE_ACCOUNT_JSON: '/nowhere/key.json' })
  assert.equal(noKey.code, 1)
  assert.match(noKey.stderr, /No Play service-account key at \/nowhere\/key\.json/)
  const broken = run(['--aab', 'a.aab'], { PLAY_SERVICE_ACCOUNT_JSON: '{"private_key_id":"do-not-print-me"' })
  assert.equal(broken.code, 1)
  assert.match(broken.stderr, /PLAY_SERVICE_ACCOUNT_JSON is not JSON/)
  assert.ok(!broken.stderr.includes('do-not-print-me'), 'the key is never printed')
})
