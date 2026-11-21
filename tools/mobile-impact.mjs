#!/usr/bin/env node
/**
 * Does a release change a phone app? A phone build is slow and sends every tester an update, so beta.yml and
 * release.yml skip it when nothing the app is built from changed since the last one shipped.
 *
 *   node tools/mobile-impact.mjs android                     compares with the android-beta tag
 *   node tools/mobile-impact.mjs ios --base ios-stable --head v0.6.0
 *
 * The comparison is with the commit the last successful publish was built from: a tag per platform and channel
 * (android-beta, android-stable, ios-beta, ios-stable) that the workflows move after each publish, NOT the previous
 * push. A run can be skipped or fail, and "since the last push" would then lose a change for good; "since the last
 * build that shipped" cannot.
 *
 * Every doubt answers "build": no tag yet, a ref that cannot be read, a diff that fails. A needless build costs
 * minutes; a skipped one leaves testers on an old app.
 *
 * Writes `impacted=true|false` to $GITHUB_OUTPUT and the reason to the step summary.
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/** The phone platforms, each with its own tags. */
export const PLATFORMS = ['android', 'ios']

/**
 * What a phone app is built from. An entry ending in "/" is a folder, anything else one file: the UI, the Tauri crate
 * and the library crates it links, the brand kit its icons come from, and what picks the packages and toolchain.
 */
export const INPUTS = [
  'apps/desktop/ui/',
  'apps/desktop/src-tauri/',
  'crates/',
  'packages/brand/',
  'Cargo.toml',
  'Cargo.lock',
  'rust-toolchain.toml',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
]

/** Inside those, what still changes no phone app: tests, prose, and the desktop-only Tauri config. */
const NEVER = [/(^|\/)__tests__\//, /\.(test|spec)\.[cm]?[jt]sx?$/, /^crates\/[^/]+\/(tests|benches)\//, /\.md$/, /^apps\/desktop\/src-tauri\/tauri\.(macos|windows|linux)\.conf\.json$/]

/** What belongs to the other phone platform only. */
const OTHER_PLATFORM = {
  android: [/^apps\/desktop\/src-tauri\/gen\/apple\//, /^apps\/desktop\/src-tauri\/tauri\.ios\.conf\.json$/],
  ios: [/^apps\/desktop\/src-tauri\/gen\/android\//, /^apps\/desktop\/src-tauri\/tauri\.android\.conf\.json$/],
}

/** True when a changed file (repository-relative, forward slashes) is something this platform's app is built from. */
export function touches(platform, file) {
  const input = INPUTS.some((entry) => (entry.endsWith('/') ? file.startsWith(entry) : file === entry))
  if (!input) return false
  return !NEVER.some((re) => re.test(file)) && !(OTHER_PLATFORM[platform] ?? []).some((re) => re.test(file))
}

/** The verdict for a list of changed files: whether to build, and the files that say so. */
export function impact(platform, files) {
  const because = files.filter((file) => touches(platform, file))
  return { impacted: because.length > 0, because }
}

/** The tag a channel's last publish is recorded under: android-beta, ios-stable and so on. */
export function markerTag(platform, channel = 'beta') {
  return `${platform}-${channel}`
}

function resolves(ref) {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function changedFiles(base, head) {
  try {
    const out = execFileSync('git', ['diff', '--name-only', '--no-renames', '-z', base, head], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    return out.split('\0').filter(Boolean)
  } catch {
    return null
  }
}

/** Decides for one platform between two refs: `{ impacted, reason }`, building on any doubt. */
export function decide(platform, base, head) {
  if (!resolves(base)) return { impacted: true, reason: `No ${base} to compare with (no ${platform} build recorded yet), so building.` }
  if (!resolves(head)) return { impacted: true, reason: `Cannot read ${head}, so building.` }
  const files = changedFiles(base, head)
  if (files === null) return { impacted: true, reason: `Could not diff ${base}..${head}, so building.` }
  const { impacted, because } = impact(platform, files)
  if (!impacted) return { impacted: false, reason: `${files.length} file(s) changed since the last ${platform} build (${base}) and none of them is part of the app.` }
  const shown = because.slice(0, 8).join(', ')
  const more = because.length > 8 ? `, and ${because.length - 8} more` : ''
  return { impacted: true, reason: `Changed since the last ${platform} build (${base}): ${shown}${more}.` }
}

function option(args, flag, fallback) {
  const at = args.indexOf(flag)
  return at !== -1 && args[at + 1] ? args[at + 1] : fallback
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [platform = '', ...args] = process.argv.slice(2)
  if (!PLATFORMS.includes(platform)) {
    process.stderr.write('usage: node tools/mobile-impact.mjs <android|ios> [--base <ref>] [--head <ref>]\n')
    process.exit(2)
  }
  const { impacted, reason } = decide(platform, option(args, '--base', markerTag(platform)), option(args, '--head', 'HEAD'))
  process.stdout.write(`${platform}: ${impacted ? 'build' : 'skip'}. ${reason}\n`)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `impacted=${impacted}\n`)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${impacted ? 'Building' : 'Skipping'} the ${platform} app: ${reason}\n`)
}
