#!/usr/bin/env node
/**
 * The version a phone build carries, from a release tag, as the Tauri config to merge into `tauri android build` or
 * `tauri ios build` with `--config`. Used by mobile-android.yml and mobile-ios.yml.
 *
 *   node tools/mobile-version.mjs android v0.6.0-beta.10
 *     {"version":"0.6.0-beta.10","bundle":{"android":{"versionCode":3615120}}}
 *   node tools/mobile-version.mjs ios v0.6.0-beta.10
 *     {"version":"0.6.0","bundle":{"iOS":{"bundleVersion":"3615120"}}}
 *
 * Android takes the whole version as its versionName. Its versionCode is the minutes since 2020-01-01 UTC, so it
 * rises with every build from any workflow, and Play refuses a code it has seen. iOS takes only the numeric core
 * (X.Y.Z) as CFBundleShortVersionString, which App Store Connect insists on; the build number (CFBundleVersion) is
 * the same minute clock plus an optional offset, so a beta and the stable release of one version never collide.
 *
 * `--build <n>` sets the build number or version code by hand. The repository variable IOS_BUILD_OFFSET reaches
 * this through `--offset <n>`.
 */
import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/** A release tag or a bare version: 1.2.3 with an optional pre-release such as -beta.4. */
const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?$/

/** 2020-01-01T00:00:00Z, the start of the version code clock. */
export const EPOCH_MS = Date.UTC(2020, 0, 1)

/** The highest version code Google Play accepts. */
export const MAX_VERSION_CODE = 2_100_000_000

/** The version in a tag (`v0.6.0-beta.10` gives `0.6.0-beta.10`), or throws a sentence saying what is wrong. */
export function versionOf(tag) {
  const match = SEMVER.exec(String(tag ?? '').trim())
  if (match === null) throw new Error(`"${tag}" is not a version tag such as v0.6.0 or v0.6.0-beta.2.`)
  return String(tag).trim().replace(/^v/, '')
}

/** The numeric core of a version (`0.6.0-beta.10` gives `0.6.0`), the only form iOS accepts as its version. */
export function numericCore(version) {
  const match = SEMVER.exec(version)
  if (match === null) throw new Error(`"${version}" is not a version.`)
  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`
}

/** Minutes since 2020-01-01 UTC: a number that only rises, for the Android version code and the iOS build number. */
export function versionCode(now = Date.now()) {
  return Math.floor((now - EPOCH_MS) / 60_000)
}

/** A whole number from an argument, or throws. */
function whole(value, name) {
  if (!/^\d+$/.test(String(value))) throw new Error(`${name} must be a whole number, not "${value}".`)
  return Number(value)
}

/** The Tauri config that stamps an Android build: the whole version as its name and a rising version code. */
export function androidConfig(tag, { build, now } = {}) {
  const code = build === undefined ? versionCode(now) : whole(build, '--build')
  if (code < 1 || code > MAX_VERSION_CODE) throw new Error(`The version code ${code} is outside 1 to ${MAX_VERSION_CODE}, which Play allows.`)
  return { version: versionOf(tag), bundle: { android: { versionCode: code } } }
}

/** The Tauri config that stamps an iOS build: X.Y.Z as its version and the build number apart. */
export function iosConfig(tag, { build, offset = 0, now } = {}) {
  const number = (build === undefined ? versionCode(now) : whole(build, '--build')) + whole(offset, '--offset')
  return { version: numericCore(versionOf(tag)), bundle: { iOS: { bundleVersion: String(number) } } }
}

/** The value after a flag, or undefined. */
function option(args, flag) {
  const at = args.indexOf(flag)
  return at === -1 ? undefined : args[at + 1]
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [platform, tag, ...rest] = process.argv.slice(2)
  try {
    const build = option(rest, '--build')
    const offset = option(rest, '--offset') || '0'
    let config
    if (platform === 'android') config = androidConfig(tag, { build })
    else if (platform === 'ios') config = iosConfig(tag, { build, offset })
    else throw new Error('usage: node tools/mobile-version.mjs <android|ios> <tag> [--build <n>] [--offset <n>]')
    const json = JSON.stringify(config)
    process.stdout.write(`${json}\n`)
    if (process.env.GITHUB_OUTPUT) {
      const name = config.version
      const number = platform === 'android' ? String(config.bundle.android?.versionCode) : String(config.bundle.iOS?.bundleVersion)
      appendFileSync(process.env.GITHUB_OUTPUT, `config=${json}\nversion=${name}\nbuild=${number}\n`)
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(2)
  }
}
