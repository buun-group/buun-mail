/**
 * The pure parts of apple-preflight.mjs: sign the App Store Connect token, ask Apple the handful of questions a
 * signed iOS build and a TestFlight upload depend on, and turn each answer into a finding in plain words. Split out
 * so they can be tested without an Apple account.
 *
 * Why this exists: Xcode reports a rejected key, a missing App ID and a missing app record with the same few lines
 * of build log, after many minutes on a macOS runner. These questions take seconds and say which one it is.
 */
import { createPrivateKey, sign } from 'node:crypto'
import { createSecureContext } from 'node:tls'

/** Apple's App Store Connect API. */
export const API_BASE = 'https://api.appstoreconnect.apple.com'

/** The app's bundle id, the same as its Android package. */
export const BUNDLE_ID = 'com.buungroup.mail'

/** The secrets that switch the build to signing from a stored Apple Distribution certificate. */
export const MANUAL_SECRETS = { p12: 'IOS_DISTRIBUTION_CERT_P12_BASE64', password: 'IOS_DISTRIBUTION_CERT_PASSWORD', profile: 'IOS_APP_PROFILE_BASE64' }

const b64url = (value) => Buffer.from(value).toString('base64url')

/** A finding: a passed check (`ok`), something worth a look (`warn`) or a reason to stop (`error`). */
const finding = (level, title, detail = '') => ({ level, title, detail })

/**
 * The `.p8` key as PEM text, from the GitHub secret. The secret is the file base64 encoded, but a pasted PEM is
 * accepted too. Throws a sentence a person can act on, never the secret.
 */
export function privateKeyPem(secret) {
  const raw = String(secret ?? '').trim()
  if (!raw) throw new Error('The APP_STORE_CONNECT_API_KEY_BASE64 secret is empty.')
  const text = raw.includes('BEGIN PRIVATE KEY') ? raw : Buffer.from(raw.replace(/\s+/g, ''), 'base64').toString('utf8')
  if (!text.includes('BEGIN PRIVATE KEY')) {
    throw new Error(
      'The APP_STORE_CONNECT_API_KEY_BASE64 secret does not decode to a .p8 file (expected text starting ' +
        '"-----BEGIN PRIVATE KEY-----"). Make it with `base64 -w0 AuthKey_<KEYID>.p8` (on a Mac `base64 -i AuthKey_<KEYID>.p8`).',
    )
  }
  return text
}

/** An App Store Connect API token: ES256, valid for 15 minutes (Apple allows 20). */
export function appStoreToken({ keyId, issuerId, pem, now = () => Date.now() }) {
  const iat = Math.floor(now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }))
  const claims = b64url(JSON.stringify({ iss: issuerId, iat, exp: iat + 15 * 60, aud: 'appstoreconnect-v1' }))
  const data = `${header}.${claims}`
  // JWS wants the raw r||s signature, not the DER one node makes by default.
  const signature = sign('sha256', Buffer.from(data), { key: createPrivateKey(pem), dsaEncoding: 'ieee-p1363' })
  return `${data}.${signature.toString('base64url')}`
}

/** Apple's own sentence from an error reply, when it sent one. */
function appleDetail(body) {
  const error = body?.errors?.[0]
  return error ? [error.title, error.detail].filter(Boolean).join(': ') : ''
}

/** Why a question got no usable answer: what Apple said, or that Apple could not be reached. */
function why(res) {
  if (res.status === 0) return `Could not reach Apple: ${res.error ?? 'no detail'}.`
  const said = appleDetail(res.body)
  return `Apple answered ${res.status}${said ? `: ${said}` : ' with no detail'}.`
}

/**
 * What a provisioning profile says, read from the XML plist Apple embeds in it (the profile is a signed wrapper
 * around that plain text), or null when the secret is not a profile.
 */
export function inspectProfile(secret) {
  const text = Buffer.from(String(secret ?? '').replace(/\s+/g, ''), 'base64').toString('latin1')
  const start = text.indexOf('<?xml')
  const end = text.lastIndexOf('</plist>')
  if (start < 0 || end < 0) return null
  const xml = text.slice(start, end + '</plist>'.length)
  const string = (key) => new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`).exec(xml)?.[1] ?? null
  const date = (key) => new RegExp(`<key>${key}</key>\\s*<date>([^<]*)</date>`).exec(xml)?.[1] ?? null
  return {
    name: string('Name'),
    uuid: string('UUID'),
    appId: string('application-identifier'),
    expires: date('ExpirationDate'),
    // Development and Ad Hoc profiles list devices; an App Store one does not.
    hasDevices: xml.includes('<key>ProvisionedDevices</key>') || xml.includes('<key>ProvisionsAllDevices</key>'),
    getTaskAllow: /<key>get-task-allow<\/key>\s*<true\s*\/>/.test(xml),
  }
}

/** Findings for the stored profile: is it a current App Store profile for this app. */
function checkProfile({ profile, expected, now }) {
  const name = MANUAL_SECRETS.profile
  const info = inspectProfile(profile)
  if (!info) return [finding('error', `${name} is not a provisioning profile`, 'Download the .mobileprovision from developer.apple.com, Profiles, and set the secret to `base64 -w0 <file>.mobileprovision`.')]
  if (info.appId !== expected) return [finding('error', `${name} is for ${info.appId ?? 'an unknown app'}, not ${expected}`, 'Make an App Store profile for exactly this App ID, with the distribution certificate.')]
  if (info.hasDevices || info.getTaskAllow) return [finding('error', `${name} is a development or ad hoc profile, not App Store`, 'Create it under Profiles, +, Distribution, "App Store Connect".')]
  const ms = info.expires ? Date.parse(info.expires) : Number.NaN
  if (Number.isNaN(ms)) return [finding('ok', `${name} is an App Store profile for ${expected}`)]
  const days = Math.floor((ms - now()) / 86_400_000)
  const day = info.expires?.slice(0, 10)
  if (days < 0) return [finding('error', `${name} expired on ${day}`, 'Regenerate the profile (Profiles, the profile, Edit, Generate) and replace the secret.')]
  return [finding(days < 30 ? 'warn' : 'ok', `${name} is an App Store profile for ${expected}, valid until ${day}`, days < 30 ? `That is ${days} days away: regenerate it before then.` : '')]
}

/**
 * Whether the build signs from a stored certificate (all three secrets, or none), and findings on whether they are
 * complete and usable. A half-configured set is an error rather than a silent fallback.
 */
export function checkSigningSecrets({ p12, password, profile, teamId, bundleId = BUNDLE_ID, now = () => Date.now() }) {
  const findings = []
  const manual = Boolean(p12)
  if (!manual) {
    if (password || profile) findings.push(finding('warn', `${MANUAL_SECRETS.p12} is not set, so the other stored-signing secrets are ignored`, 'Set it to sign from the stored certificate, or remove the others.'))
    return { manual, findings }
  }
  const missing = [password ? null : MANUAL_SECRETS.password, profile ? null : MANUAL_SECRETS.profile].filter(Boolean)
  if (missing.length > 0) {
    findings.push(finding('error', `Signing from a stored certificate is half set up: ${missing.join(', ')} missing`, `Add them, or remove ${MANUAL_SECRETS.p12} to sign automatically with the API key.`))
    return { manual, findings }
  }
  // Node cannot read every .p12 flavour macOS can, so only a wrong password is an error.
  try {
    createSecureContext({ pfx: Buffer.from(String(p12).replace(/\s+/g, ''), 'base64'), passphrase: password })
    findings.push(finding('ok', 'The distribution certificate (.p12) opens with its password'))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/mac verify|bad decrypt|password/i.test(message)) findings.push(finding('error', 'The distribution certificate password is wrong', `${MANUAL_SECRETS.password} must be the password the .p12 was exported with.`))
    else findings.push(finding('warn', 'Could not open the distribution certificate here', `${message}. The Mac may still read it.`))
  }
  findings.push(...checkProfile({ profile, expected: `${teamId}.${bundleId}`, now }))
  return { manual, findings }
}

/**
 * Asks Apple the questions and returns the findings in the order asked. Stops early when the key itself is refused,
 * since nothing after that can be answered. `call(path)` GETs `API_BASE + path` and resolves `{ status, body }`; it
 * throws only when Apple cannot be reached.
 */
export async function checkApple({ call, teamId, bundleId = BUNDLE_ID, manual = false }) {
  const findings = []
  const add = (level, title, detail) => findings.push(finding(level, title, detail))

  // 1. The key, as Apple sees it.
  let probe
  try {
    probe = await call('/v1/apps?limit=1')
  } catch (error) {
    add('error', 'Could not reach Apple', error instanceof Error ? error.message : String(error))
    return findings
  }
  if (probe.status === 401) {
    add(
      'error',
      'Apple rejected the API key (401)',
      'The Key ID, Issuer ID and the .p8 must all come from the same key on App Store Connect, Users and Access, ' +
        `Integrations, Team Keys, and the key must not be revoked. Apple said: ${appleDetail(probe.body) || 'no detail'}. ` +
        'Fastest fix: make a new Admin team key and replace all three secrets together.',
    )
    return findings
  }
  if (probe.status !== 200) {
    add('error', `Apple answered the key check with ${probe.status}`, appleDetail(probe.body) || 'No detail given.')
    return findings
  }
  add('ok', 'Apple accepted the API key')

  const ask = (path) => call(path).catch((error) => ({ status: 0, body: null, error: error instanceof Error ? error.message : String(error) }))

  // 2. Automatic signing makes Xcode create the certificate and profile itself, which needs an Admin key and, for the
  // development profile it signs the archive with first, one registered iPhone or iPad. A stored certificate needs
  // neither.
  if (manual) {
    add('ok', 'Signing from the stored certificate, so no Admin key or registered device is needed')
  } else {
    const users = await ask('/v1/users?limit=1')
    if (users.status === 200) add('ok', 'The key has the Admin role')
    else if (users.status === 403) add('warn', 'The key does not look like an Admin key', 'Automatic signing needs an Admin key to create the certificate and profile. If the build fails with "Authentication failed", make the key with the Admin role.')

    const devices = await ask('/v1/devices?filter[status]=ENABLED&limit=200')
    if (devices.status === 403) {
      add('error', 'The key is not allowed to read devices', `Use an Admin team key. ${appleDetail(devices.body)}`.trim())
    } else if (devices.status !== 200) {
      add('warn', 'Could not read the registered devices', why(devices))
    } else {
      const all = devices.body?.data ?? []
      const phones = all.filter((device) => ['IOS', 'UNIVERSAL'].includes(device.attributes?.platform))
      if (all.length === 0) {
        add(
          'error',
          'No devices are registered on the Apple team',
          'Automatic signing first signs with a development profile, which Apple will not make with no devices. Register one iPhone or ' +
            `iPad at developer.apple.com, Devices (it is never installed from), or sign from a stored certificate (${MANUAL_SECRETS.p12}).`,
        )
      } else if (phones.length === 0) {
        add('error', 'Only non-iOS devices are registered', 'Register an iPhone or iPad (its UDID) under Devices.')
      } else {
        add('ok', `${phones.length} iPhone or iPad registered`)
      }
    }
  }

  // 3. The App ID.
  const found = await ask(`/v1/bundleIds?filter[identifier]=${encodeURIComponent(bundleId)}&limit=50`)
  if (found.status === 200) {
    // The filter matches by prefix, so com.x.mail also returns com.x.mail.other.
    const match = (found.body?.data ?? []).find((each) => each.attributes?.identifier === bundleId)
    if (!match) {
      add('error', `The App ID ${bundleId} is not registered`, 'Create it at developer.apple.com, Certificates, Identifiers and Profiles, Identifiers, +, App IDs, App, as an Explicit ID with exactly this bundle ID.')
    } else {
      add('ok', `The App ID ${bundleId} exists`)
      if (teamId && match.attributes?.seedId && match.attributes.seedId !== teamId) {
        add('warn', `${bundleId} has App ID prefix ${match.attributes.seedId}, not the team id ${teamId}`, 'Check APPLE_TEAM_ID is the Team ID of the account that owns this App ID.')
      }
    }
  } else {
    add('warn', `Could not look up the App ID ${bundleId}`, why(found))
  }

  // 4. The upload needs an app record in App Store Connect to go to.
  const apps = await ask(`/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}&limit=5`)
  if (apps.status === 200) {
    if ((apps.body?.data ?? []).length === 0) add('error', `There is no App Store Connect app record for ${bundleId}`, 'Create it at App Store Connect, Apps, +, New App, choosing this bundle ID. The upload has nowhere to go until it exists.')
    else add('ok', 'The App Store Connect app record exists')
  } else {
    add('warn', 'Could not check for the App Store Connect app record', why(apps))
  }
  return findings
}

/** The findings as a Markdown table, for the run's summary page. */
export function summaryMarkdown(findings) {
  const mark = { ok: 'OK', warn: 'Check', error: 'Fix' }
  const rows = findings.map((each) => {
    const text = each.detail ? `${each.title}. ${each.detail}` : each.title
    return `| ${mark[each.level]} | ${text.replace(/\|/g, '/').replace(/\n/g, ' ')} |`
  })
  return ['### Apple credentials check', '', '| | |', '|---|---|', ...rows, ''].join('\n')
}

/** True when any finding is a reason to stop the build. */
export const hasErrors = (findings) => findings.some((each) => each.level === 'error')
