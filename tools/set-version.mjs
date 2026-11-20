#!/usr/bin/env node
/**
 * Writes one version into every file that carries it: tauri.conf.json, package.json and the workspace Cargo.toml.
 * beta.yml uses it to stamp a beta's version into a build's checkout; stable versions come from the release pull
 * request instead.
 *
 *   node tools/set-version.mjs 0.6.0-beta.2
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/
const root = join(import.meta.dirname, '..')
const version = process.argv[2] ?? ''
if (!VERSION.test(version)) {
  process.stderr.write('usage: node tools/set-version.mjs <major.minor.patch[-pre]>\n')
  process.exit(2)
}

/** Rewrites one file through `change`, failing loudly when no version was found in it. */
function edit(file, change) {
  const path = join(root, file)
  const before = readFileSync(path, 'utf8')
  const after = change(before)
  if (after === before && !before.includes(version)) throw new Error(`no version to change in ${file}`)
  writeFileSync(path, after)
}

const jsonVersion = (text) => text.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`)
edit('apps/desktop/src-tauri/tauri.conf.json', jsonVersion)
edit('package.json', jsonVersion)
edit('Cargo.toml', (text) => text.replace(/(\[workspace\.package\]\nversion = ")[^"]+(")/, `$1${version}$2`))
process.stdout.write(`Version ${version} written.\n`)
