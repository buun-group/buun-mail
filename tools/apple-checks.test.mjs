import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { generateKeyPairSync, verify } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { BUNDLE_ID, appStoreToken, checkApple, checkSigningSecrets, hasErrors, inspectProfile, privateKeyPem, summaryMarkdown } from './apple-checks.mjs'

const APP = BUNDLE_ID
const TEAM = 'ABCDE12345'
const SCRIPT = join(import.meta.dirname, 'apple-preflight.mjs')

/** A throwaway P-256 key, the kind Apple issues. */
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const PEM = String(privateKey.export({ type: 'pkcs8', format: 'pem' }))

test('the .p8 secret decodes from base64, wrapped or not, or is taken as pasted PEM', () => {
  const secret = Buffer.from(PEM).toString('base64')
  assert.equal(privateKeyPem(secret), PEM)
  assert.equal(privateKeyPem(secret.replace(/(.{60})/g, '$1\n')), PEM)
  assert.equal(privateKeyPem(PEM), PEM.trim())
  assert.throws(() => privateKeyPem(''), /empty/)
  assert.throws(() => privateKeyPem(undefined), /empty/)
  assert.throws(() => privateKeyPem('not base64 of a key'), /does not decode to a \.p8 file/)
})

test('the App Store Connect token has the claims Apple expects and verifies with the key', () => {
  const token = appStoreToken({ keyId: 'KEY1234567', issuerId: 'issuer-uuid', pem: PEM, now: () => 1_800_000_000_000 })
  const [header, claims, signature] = token.split('.')
  const json = (part) => JSON.parse(Buffer.from(part ?? '', 'base64url').toString())
  assert.deepEqual(json(header), { alg: 'ES256', kid: 'KEY1234567', typ: 'JWT' })
  assert.deepEqual(json(claims), { iss: 'issuer-uuid', iat: 1_800_000_000, exp: 1_800_000_900, aud: 'appstoreconnect-v1' })
  const raw = Buffer.from(signature ?? '', 'base64url')
  assert.equal(raw.length, 64, 'raw r||s, as JWS wants')
  assert.ok(verify('sha256', Buffer.from(`${header}.${claims}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, raw))
})

/** A fake Apple: a healthy account (Admin key, one iPhone, the App ID, the app record) unless `over` says otherwise. */
function fakeApple(over = {}) {
  const routes = {
    '/v1/apps?limit=1': { status: 200, body: { data: [] } },
    '/v1/users?limit=1': { status: 200, body: { data: [] } },
    '/v1/devices?filter[status]=ENABLED&limit=200': { status: 200, body: { data: [{ attributes: { platform: 'IOS' } }] } },
    [`/v1/bundleIds?filter[identifier]=${APP}&limit=50`]: {
      status: 200,
      body: { data: [{ id: 'B1', attributes: { identifier: `${APP}.share`, seedId: TEAM } }, { id: 'B0', attributes: { identifier: APP, seedId: TEAM } }] },
    },
    [`/v1/apps?filter[bundleId]=${APP}&limit=5`]: { status: 200, body: { data: [{ id: 'app1' }] } },
    ...over,
  }
  const seen = []
  const call = async (path) => {
    seen.push(path)
    const hit = routes[path]
    if (hit === 'network') throw new Error('getaddrinfo ENOTFOUND')
    if (!hit) throw new Error(`unexpected request ${path}`)
    return hit
  }
  return { call, seen }
}

const run = async (over, manual = false) => {
  const { call, seen } = fakeApple(over)
  return { findings: await checkApple({ call, teamId: TEAM, manual }), seen }
}
const titles = (findings, level) => findings.filter((each) => each.level === level).map((each) => each.title)

test('a healthy account passes every check, the app record included', async () => {
  const { findings } = await run()
  assert.equal(hasErrors(findings), false)
  assert.deepEqual(titles(findings, 'warn'), [])
  assert.deepEqual(titles(findings, 'ok'), ['Apple accepted the API key', 'The key has the Admin role', '1 iPhone or iPad registered', `The App ID ${APP} exists`, 'The App Store Connect app record exists'])
})

test('a rejected key stops at once and names the three things that must match', async () => {
  const { findings, seen } = await run({ '/v1/apps?limit=1': { status: 401, body: { errors: [{ title: 'Authentication credentials are missing or invalid.' }] } } })
  assert.equal(findings.length, 1)
  assert.match(findings[0]?.title ?? '', /rejected the API key \(401\)/)
  assert.match(findings[0]?.detail ?? '', /Key ID, Issuer ID and the \.p8/)
  assert.match(findings[0]?.detail ?? '', /Authentication credentials are missing or invalid/)
  assert.deepEqual(seen, ['/v1/apps?limit=1'])
})

test('Apple out of reach stops the check', async () => {
  const { findings } = await run({ '/v1/apps?limit=1': 'network' })
  assert.deepEqual(titles(findings, 'error'), ['Could not reach Apple'])
})

test('a key that is not Admin is a warning, one that may not read devices an error', async () => {
  const notAdmin = await run({ '/v1/users?limit=1': { status: 403, body: {} } })
  assert.deepEqual(titles(notAdmin.findings, 'warn'), ['The key does not look like an Admin key'])
  assert.equal(hasErrors(notAdmin.findings), false)
  const noDevices = await run({ '/v1/devices?filter[status]=ENABLED&limit=200': { status: 403, body: {} } })
  assert.deepEqual(titles(noDevices.findings, 'error'), ['The key is not allowed to read devices'])
})

test('automatic signing wants one iPhone or iPad registered', async () => {
  const DEVICES = '/v1/devices?filter[status]=ENABLED&limit=200'
  const none = await run({ [DEVICES]: { status: 200, body: { data: [] } } })
  assert.deepEqual(titles(none.findings, 'error'), ['No devices are registered on the Apple team'])
  const macOnly = await run({ [DEVICES]: { status: 200, body: { data: [{ attributes: { platform: 'MAC_OS' } }] } } })
  assert.deepEqual(titles(macOnly.findings, 'error'), ['Only non-iOS devices are registered'])
  const unreadable = await run({ [DEVICES]: { status: 500, body: null } })
  assert.deepEqual(titles(unreadable.findings, 'warn'), ['Could not read the registered devices'])
  assert.match(unreadable.findings.find((each) => each.level === 'warn')?.detail ?? '', /Apple answered 500 with no detail/)
})

test('a stored certificate needs neither an Admin key nor a device, but still the App ID and app record', async () => {
  const { findings, seen } = await run({ '/v1/devices?filter[status]=ENABLED&limit=200': { status: 200, body: { data: [] } } }, true)
  assert.equal(hasErrors(findings), false)
  assert.ok(!seen.some((path) => path.includes('/v1/devices') || path.includes('/v1/users')))
  assert.ok(seen.some((path) => path.includes('filter[bundleId]')))
})

test('a missing App ID is named, and a prefix match on another id is not mistaken for it', async () => {
  const { findings } = await run({ [`/v1/bundleIds?filter[identifier]=${APP}&limit=50`]: { status: 200, body: { data: [{ id: 'B1', attributes: { identifier: `${APP}.share` } }] } } })
  assert.deepEqual(titles(findings, 'error'), [`The App ID ${APP} is not registered`])
  assert.match(findings.find((each) => each.level === 'error')?.detail ?? '', /Explicit ID/)
})

test('an App ID under another team prefix is a warning', async () => {
  const { findings } = await run({ [`/v1/bundleIds?filter[identifier]=${APP}&limit=50`]: { status: 200, body: { data: [{ id: 'B0', attributes: { identifier: APP, seedId: 'OTHERTEAM1' } }] } } })
  assert.match(titles(findings, 'warn')[0] ?? '', /App ID prefix OTHERTEAM1, not the team id ABCDE12345/)
})

test('an upload with no app record to go to is stopped', async () => {
  const { findings } = await run({ [`/v1/apps?filter[bundleId]=${APP}&limit=5`]: { status: 200, body: { data: [] } } })
  assert.deepEqual(titles(findings, 'error'), [`There is no App Store Connect app record for ${APP}`])
})

/** A provisioning profile as a secret: Apple's signed wrapper around a plain XML plist, base64. */
function makeProfile({ name = 'Buun Mail App Store', appId = `${TEAM}.${APP}`, expires = '2099-01-01T00:00:00Z', devices = false, taskAllow = false } = {}) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>Name</key><string>${name}</string>
<key>UUID</key><string>11111111-2222-3333-4444-555555555555</string>
<key>ExpirationDate</key><date>${expires}</date>
${devices ? '<key>ProvisionedDevices</key><array><string>00008030-001234567890002E</string></array>' : ''}
<key>Entitlements</key><dict>
<key>application-identifier</key><string>${appId}</string>
<key>get-task-allow</key><${taskAllow ? 'true' : 'false'}/>
</dict></dict></plist>`
  return Buffer.concat([Buffer.from([0x30, 0x82, 0x0a, 0xf1]), Buffer.from(xml), Buffer.from([0xde, 0xad])]).toString('base64')
}

test('a profile is read from inside its wrapper, and anything else is not a profile', () => {
  const info = inspectProfile(makeProfile())
  assert.equal(info?.name, 'Buun Mail App Store')
  assert.equal(info?.appId, `${TEAM}.${APP}`)
  assert.equal(info?.expires, '2099-01-01T00:00:00Z')
  assert.equal(info?.hasDevices, false)
  assert.equal(info?.getTaskAllow, false)
  assert.equal(inspectProfile(makeProfile({ devices: true }))?.hasDevices, true)
  assert.equal(inspectProfile(makeProfile({ taskAllow: true }))?.getTaskAllow, true)
  assert.equal(inspectProfile(makeProfile().replace(/(.{40})/g, '$1\n'))?.name, 'Buun Mail App Store')
  assert.equal(inspectProfile(Buffer.from('hello').toString('base64')), null)
  assert.equal(inspectProfile(undefined), null)
})

const base = { teamId: TEAM, now: () => Date.parse('2026-11-21T00:00:00Z') }
const full = (over = {}) => ({ ...base, p12: 'AAAA', password: 'pw', profile: makeProfile(), ...over })

test('no stored certificate is automatic signing, with a warning only if the other secrets are set', () => {
  assert.deepEqual(checkSigningSecrets(base), { manual: false, findings: [] })
  const stray = checkSigningSecrets({ ...base, profile: makeProfile() })
  assert.equal(stray.manual, false)
  assert.match(stray.findings[0]?.title ?? '', /IOS_DISTRIBUTION_CERT_P12_BASE64 is not set/)
})

test('a half set up certificate is refused, naming what is missing', () => {
  const result = checkSigningSecrets({ ...base, p12: 'AAAA' })
  assert.equal(result.manual, true)
  assert.deepEqual(result.findings.map((each) => each.level), ['error'])
  assert.match(result.findings[0]?.title ?? '', /IOS_DISTRIBUTION_CERT_PASSWORD, IOS_APP_PROFILE_BASE64 missing/)
})

test('the profile must be a current App Store profile for this app', () => {
  const error = (over) => checkSigningSecrets(full(over)).findings.find((each) => each.level === 'error')?.title ?? ''
  assert.match(error({ profile: makeProfile({ appId: `${TEAM}.com.other.app` }) }), /is for ABCDE12345\.com\.other\.app, not ABCDE12345\.com\.buungroup\.mail/)
  assert.match(error({ profile: makeProfile({ devices: true }) }), /development or ad hoc profile/)
  assert.match(error({ profile: makeProfile({ expires: '2026-10-01T00:00:00Z' }) }), /expired on 2026-10-01/)
  assert.match(error({ profile: Buffer.from('nope').toString('base64') }), /is not a provisioning profile/)
  const soon = checkSigningSecrets(full({ profile: makeProfile({ expires: '2026-12-06T00:00:00Z' }) }))
  assert.equal(hasErrors(soon.findings), false)
  assert.match(soon.findings.find((each) => each.level === 'warn' && /PROFILE/.test(each.title))?.detail ?? '', /15 days away/)
})

test('a .p12 that cannot be read here is only a warning', () => {
  const result = checkSigningSecrets(full({ p12: Buffer.from('not a pkcs12 file').toString('base64') }))
  assert.equal(hasErrors(result.findings), false)
  assert.ok(result.findings.some((each) => each.level === 'warn' && /Could not open the distribution certificate here/.test(each.title)))
})

/** A real .p12 made with openssl, or null where openssl is missing. */
function makeP12(password) {
  const dir = mkdtempSync(join(tmpdir(), 'p12-'))
  try {
    const sh = (...args) => execFileSync('openssl', args, { cwd: dir, stdio: 'pipe' })
    sh('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'k.pem', '-out', 'c.pem', '-subj', '/CN=Buun Mail Test', '-days', '2')
    sh('pkcs12', '-export', '-inkey', 'k.pem', '-in', 'c.pem', '-out', 't.p12', '-passout', `pass:${password}`, '-certpbe', 'PBE-SHA1-3DES', '-keypbe', 'PBE-SHA1-3DES', '-macalg', 'sha1')
    return readFileSync(join(dir, 't.p12')).toString('base64')
  } catch {
    return null
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const P12 = makeP12('s3cret!')

test('a real .p12 opens with its password, and a wrong password is called wrong', { skip: P12 === null && 'openssl is not installed' }, () => {
  const good = checkSigningSecrets(full({ p12: P12, password: 's3cret!' }))
  assert.ok(good.findings.some((each) => each.level === 'ok' && /\.p12\) opens with its password/.test(each.title)))
  const bad = checkSigningSecrets(full({ p12: P12, password: 'not it' }))
  assert.deepEqual(titles(bad.findings, 'error'), ['The distribution certificate password is wrong'])
})

test('the summary is a table with one row per finding, pipes escaped', async () => {
  const { findings } = await run({ '/v1/users?limit=1': { status: 403, body: {} } })
  const markdown = summaryMarkdown([...findings, { level: 'error', title: 'A | B', detail: 'x\ny' }])
  assert.match(markdown, /### Apple credentials check/)
  assert.match(markdown, /\| OK \| Apple accepted the API key \|/)
  assert.match(markdown, /\| Check \| The key does not look like an Admin key\./)
  assert.match(markdown, /\| Fix \| A \/ B\. x y \|/)
})

test('the preflight command stops before any network call when a secret is missing, naming it', () => {
  try {
    execFileSync('node', [SCRIPT], { stdio: 'pipe', encoding: 'utf8', env: { PATH: process.env.PATH, KEY_ID: 'K', ISSUER: 'I' } })
    assert.fail('the preflight should have failed')
  } catch (error) {
    assert.equal(error.status, 1)
    assert.match(String(error.stdout), /Missing secrets: APP_STORE_CONNECT_API_KEY_BASE64, APPLE_TEAM_ID/)
  }
})
