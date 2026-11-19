#!/usr/bin/env node
/**
 * Makes a release: sets the version everywhere it is written, commits, and tags it.
 *
 *   pnpm release 0.2.0
 *   git push --follow-tags
 *
 * The push starts .github/workflows/release.yml, which builds the installers for Linux, macOS and Windows into a draft
 * GitHub release. Nothing is published until the draft is.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const VERSION = /^\d+\.\d+\.\d+$/
const root = join(import.meta.dirname, '..')
const version = process.argv[2]

if (version === undefined || !VERSION.test(version)) {
  process.stderr.write('usage: pnpm release <major.minor.patch>, such as pnpm release 0.2.0\n')
  process.exit(2)
}

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
if (git('status', '--porcelain', '--untracked-files=no') !== '') {
  process.stderr.write('Commit or stash your changes first: a release is made from a clean tree.\n')
  process.exit(1)
}
if (git('tag', '--list', `v${version}`) !== '') {
  process.stderr.write(`v${version} is already tagged.\n`)
  process.exit(1)
}

/** Rewrites one file through `change`, failing loudly when the version was not found. */
function edit(file, change) {
  const path = join(root, file)
  const before = readFileSync(path, 'utf8')
  const after = change(before)
  if (after === before) throw new Error(`no version to change in ${file}`)
  writeFileSync(path, after)
}

const jsonVersion = (text) => text.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`)
edit('apps/desktop/src-tauri/tauri.conf.json', jsonVersion)
edit('package.json', (text) => (text.includes('"version"') ? jsonVersion(text) : text.replace('"private": true,', `"private": true,\n  "version": "${version}",`)))
edit('Cargo.toml', (text) => text.replace(/(\[workspace\.package\]\nversion = ")[^"]+(")/, `$1${version}$2`))

// The lockfile carries the workspace crates' versions; refresh just those, offline.
execFileSync('node', ['tools/with-rustup.mjs', 'cargo', 'update', '--workspace', '--offline'], { cwd: root, stdio: 'inherit' })

git('add', 'apps/desktop/src-tauri/tauri.conf.json', 'package.json', 'Cargo.toml', 'Cargo.lock')
git('commit', '-m', `chore: release v${version}`)
git('tag', '-a', `v${version}`, '-m', `Buun Mail v${version}`)
process.stdout.write(`Tagged v${version}. Push it to build the installers:\n\n  git push --follow-tags\n`)
