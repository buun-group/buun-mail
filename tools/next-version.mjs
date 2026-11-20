#!/usr/bin/env node
/**
 * The next beta's version, for .github/workflows/beta.yml: from the newest stable tag (v1.2.3) and the conventional
 * commits since it, the next stable version, and the beta number after any beta tags it already has.
 *
 *   node tools/next-version.mjs     prints {"release":true,"version":"0.6.0-beta.2","tag":"v0.6.0-beta.2","base":"v0.5.0"}
 *
 * Before 1.0 a breaking change or a feat raises the minor version and a fix or perf the patch; from 1.0 a breaking
 * change raises the major. `release` is false unless a feat, fix, perf or breaking change came after the nearest tag
 * (the last beta or stable release this commit already contains), so a push of only docs, CI or chores makes no beta.
 */
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const STABLE = /^v(\d+)\.(\d+)\.(\d+)$/

/** `[major, minor, patch]` of the newest stable tag among `tags`, or null when there is none. */
export function newestStable(tags) {
  const versions = tags.map((tag) => STABLE.exec(tag)).filter((match) => match !== null).map((match) => [Number(match[1]), Number(match[2]), Number(match[3])])
  versions.sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2])
  return versions[0] ?? null
}

/** How far commits move the version: 'major', 'minor', 'patch' or null. Each commit is its whole message. */
export function bumpFor(messages) {
  let bump = null
  for (const message of messages) {
    const subject = message.split('\n')[0] ?? ''
    const type = /^(\w+)(\([^)]*\))?(!)?:/.exec(subject)
    if (type === null) continue
    if (type[3] === '!' || /^BREAKING[ -]CHANGE:/m.test(message)) return 'major'
    if (type[1] === 'feat') bump = 'minor'
    else if ((type[1] === 'fix' || type[1] === 'perf') && bump === null) bump = 'patch'
  }
  return bump
}

/** The next stable version after `base` for a bump; a breaking change before 1.0 moves only the minor. */
export function nextStable([major, minor, patch], bump) {
  if (bump === 'major' && major > 0) return `${major + 1}.0.0`
  if (bump === 'major' || bump === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

/** The beta number after every `v<version>-beta.N` tag already made. */
export function nextBeta(version, tags) {
  const prefix = `v${version}-beta.`
  const taken = tags.filter((tag) => tag.startsWith(prefix)).map((tag) => Number(tag.slice(prefix.length))).filter(Number.isInteger)
  return Math.max(0, ...taken) + 1
}

/** Works it out from the repository's tags and history. */
export function plan(git) {
  const tags = git('tag', '--list', 'v*').split('\n').filter(Boolean)
  const stable = newestStable(tags) ?? [0, 0, 0]
  const base = `v${stable.join('.')}`
  const log = (range) => git('log', '--format=%B%x00', range).split('\0').map((message) => message.trim()).filter(Boolean)
  const bump = bumpFor(log(tags.includes(base) ? `${base}..HEAD` : 'HEAD'))
  if (bump === null) return { release: false, base }
  let nearest = null
  try {
    nearest = git('describe', '--tags', '--abbrev=0', '--match', 'v*') || null
  } catch {
    // No tag behind this commit yet: everything since the start counts.
  }
  if (nearest !== null && nearest !== base && bumpFor(log(`${nearest}..HEAD`)) === null) return { release: false, base }
  const version = nextStable(stable, bump)
  const beta = `${version}-beta.${nextBeta(version, tags)}`
  return { release: true, version: beta, tag: `v${beta}`, base }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
  process.stdout.write(`${JSON.stringify(plan(git))}\n`)
}
