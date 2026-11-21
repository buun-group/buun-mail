import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, test } from 'node:test'

import { impact, markerTag, touches } from './mobile-impact.mjs'

const SCRIPT = join(import.meta.dirname, 'mobile-impact.mjs')

test('both phone apps count the UI, the Tauri crate, the crates, the brand and the toolchain', () => {
  for (const file of [
    'apps/desktop/ui/src/components/reader/Reader.tsx',
    'apps/desktop/ui/src/locales/en/common.json',
    'apps/desktop/ui/package.json',
    'apps/desktop/src-tauri/src/mailbox.rs',
    'apps/desktop/src-tauri/Cargo.toml',
    'apps/desktop/src-tauri/tauri.conf.json',
    'apps/desktop/src-tauri/capabilities/mobile.json',
    'crates/routing/src/lib.rs',
    'crates/store/Cargo.toml',
    'packages/brand/assets/mobile-icon-1024.png',
    'Cargo.toml',
    'Cargo.lock',
    'rust-toolchain.toml',
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
  ]) {
    assert.equal(touches('android', file), true, `android ${file}`)
    assert.equal(touches('ios', file), true, `ios ${file}`)
  }
})

test('the Android project and config count for Android only', () => {
  for (const file of ['apps/desktop/src-tauri/gen/android/app/build.gradle.kts', 'apps/desktop/src-tauri/gen/android/app/src/main/AndroidManifest.xml', 'apps/desktop/src-tauri/tauri.android.conf.json']) {
    assert.equal(touches('android', file), true, file)
    assert.equal(touches('ios', file), false, file)
  }
})

test('the iOS project and config count for iOS only', () => {
  for (const file of ['apps/desktop/src-tauri/gen/apple/project.yml', 'apps/desktop/src-tauri/tauri.ios.conf.json']) {
    assert.equal(touches('ios', file), true, file)
    assert.equal(touches('android', file), false, file)
  }
})

test('pipelines, docs, tools, packaging, tests and the desktop-only config change no phone app', () => {
  for (const file of [
    '.github/workflows/mobile-android.yml',
    '.github/workflows/beta.yml',
    'docs/mobile.md',
    'README.md',
    'CHANGELOG.md',
    'apps/desktop/README.md',
    'crates/routing/README.md',
    'tools/play-ship.mjs',
    'packaging/arch/PKGBUILD',
    'config/workspaces.example.toml',
    'apps/desktop/ui/src/components/reader/Reader.test.tsx',
    'apps/desktop/ui/src/__tests__/a.ts',
    'crates/store/tests/store.rs',
    'crates/message/benches/parse.rs',
    'apps/desktop/src-tauri/tauri.macos.conf.json',
  ]) {
    assert.equal(touches('android', file), false, file)
    assert.equal(touches('ios', file), false, file)
  }
})

test('a folder or file with a similar name is not mistaken for an input', () => {
  for (const file of ['apps/desktop/ui-old/a.ts', 'crates-extra/a.rs', 'package.json.bak', 'packages/brand-old/x.svg']) {
    assert.equal(touches('android', file), false, file)
  }
  assert.equal(touches('android', 'apps/desktop/ui/src/latest.ts'), true, 'a shipped file with "test" in its name still counts')
})

test('the verdict names only the files that make it', () => {
  assert.deepEqual(impact('android', []), { impacted: false, because: [] })
  assert.deepEqual(impact('ios', ['docs/a.md', 'apps/desktop/src-tauri/gen/android/x', 'crates/rules/src/lib.rs']), { impacted: true, because: ['crates/rules/src/lib.rs'] })
})

test('the tags are per platform and channel', () => {
  assert.equal(markerTag('android'), 'android-beta')
  assert.equal(markerTag('ios', 'stable'), 'ios-stable')
})

const dirs = []
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

/** A repository built from steps of `{ files, tag }`. */
function repo(steps) {
  const dir = mkdtempSync(join(tmpdir(), 'mobile-impact-'))
  dirs.push(dir)
  const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args], { cwd: dir, stdio: 'ignore' })
  git('init', '-q', '-b', 'dev')
  steps.forEach(({ files, tag }, index) => {
    for (const file of files) {
      mkdirSync(dirname(join(dir, file)), { recursive: true })
      writeFileSync(join(dir, file), `${index}\n`)
    }
    git('add', '--', ...files)
    git('commit', '-q', '-m', `step ${index}`)
    if (tag) git('tag', '-f', tag)
  })
  return dir
}

/** Runs the command in `dir`: what it printed and wrote to $GITHUB_OUTPUT. */
function run(dir, args) {
  const out = join(dir, '..', `${dir.split('/').at(-1)}-out`)
  writeFileSync(out, '')
  const printed = execFileSync('node', [SCRIPT, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: '' } })
  const output = readFileSync(out, 'utf8').trim()
  rmSync(out)
  return { printed, output }
}

test('the command builds when no build has been recorded yet', () => {
  const dir = repo([{ files: ['docs/a.md'] }])
  const result = run(dir, ['android'])
  assert.equal(result.output, 'impacted=true')
  assert.match(result.printed, /android: build\. No android-beta to compare with/)
})

test('the command skips when only docs and pipelines changed since the last build', () => {
  const dir = repo([{ files: ['crates/routing/src/lib.rs'], tag: 'ios-beta' }, { files: ['docs/a.md'] }, { files: ['.github/workflows/beta.yml'] }])
  assert.equal(run(dir, ['ios']).output, 'impacted=false')
})

test('the command still builds for a change several pushes back', () => {
  const dir = repo([{ files: ['docs/a.md'], tag: 'android-beta' }, { files: ['apps/desktop/ui/src/a.ts'] }, { files: ['docs/b.md'] }])
  const result = run(dir, ['android'])
  assert.equal(result.output, 'impacted=true')
  assert.match(result.printed, /apps\/desktop\/ui\/src\/a\.ts/)
})

test('an Android-only change since the iOS tag does not build iOS', () => {
  const dir = repo([{ files: ['docs/a.md'], tag: 'ios-stable' }, { files: ['apps/desktop/src-tauri/gen/android/app/build.gradle.kts'] }])
  assert.equal(run(dir, ['ios', '--base', 'ios-stable']).output, 'impacted=false')
  assert.equal(run(dir, ['android', '--base', 'ios-stable']).output, 'impacted=true')
})

test('the command builds when the base is something this checkout does not have, and refuses an unknown platform', () => {
  const dir = repo([{ files: ['docs/a.md'] }])
  assert.equal(run(dir, ['android', '--base', 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef']).output, 'impacted=true')
  assert.throws(() => execFileSync('node', [SCRIPT, 'windows'], { cwd: dir, stdio: 'pipe' }))
})
