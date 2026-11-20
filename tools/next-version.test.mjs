import assert from 'node:assert/strict'
import { test } from 'node:test'

import { bumpFor, nextBeta, nextStable, newestStable, plan } from './next-version.mjs'

test('the newest stable tag wins over betas and older versions, by number', () => {
  assert.deepEqual(newestStable(['v0.9.0', 'v0.10.0', 'v0.11.0-beta.3', 'build-4']), [0, 10, 0])
  assert.equal(newestStable(['v1.0.0-beta.1']), null)
})

test('feat raises the minor, fix the patch, and a breaking change waits for 1.0 to raise the major', () => {
  assert.equal(bumpFor(['chore: tidy', 'docs: words']), null)
  assert.equal(bumpFor(['fix(ui): a thing', 'chore: x']), 'patch')
  assert.equal(bumpFor(['fix: a', 'feat(sync): b']), 'minor')
  assert.equal(bumpFor(['feat!: new format']), 'major')
  assert.equal(bumpFor(['refactor: x\n\nBREAKING CHANGE: the file moved']), 'major')
  assert.equal(nextStable([0, 5, 0], 'minor'), '0.6.0')
  assert.equal(nextStable([0, 5, 0], 'major'), '0.6.0')
  assert.equal(nextStable([1, 2, 3], 'major'), '2.0.0')
  assert.equal(nextStable([0, 5, 0], 'patch'), '0.5.1')
})

test('betas count up from the tags already made', () => {
  assert.equal(nextBeta('0.6.0', ['v0.5.0']), 1)
  assert.equal(nextBeta('0.6.0', ['v0.6.0-beta.1', 'v0.6.0-beta.2', 'v0.6.1-beta.7']), 3)
})

test('plans the next beta from the history, or nothing when nothing would be released', () => {
  const git = (tags, log) => (...args) => (args[0] === 'tag' ? tags.join('\n') : log.map((message) => `${message}\0`).join('\n'))
  assert.deepEqual(plan(git(['v0.5.0', 'v0.6.0-beta.1'], ['feat(updates): beta channel', 'fix: typo'])), { release: true, version: '0.6.0-beta.2', tag: 'v0.6.0-beta.2', base: 'v0.5.0' })
  assert.deepEqual(plan(git(['v0.5.0'], ['docs: readme', 'ci: workflow'])), { release: false, base: 'v0.5.0' })
})
