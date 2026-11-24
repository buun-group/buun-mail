import assert from 'node:assert/strict'
import { test } from 'node:test'

import { assetId, downloadUrl, publicManifest } from './updater-urls.mjs'

const REPO = 'buun-group/buun-mail'
const TAG = 'v0.6.0-beta.13'
const api = (id) => `https://api.github.com/repos/${REPO}/releases/assets/${id}`

test('an API asset URL gives its id, and any other URL gives none', () => {
  assert.equal(assetId(api(781887796)), 781887796)
  assert.equal(assetId(`https://github.com/${REPO}/releases/download/${TAG}/a.exe`), null)
  assert.equal(assetId(`${api(1)}/extra`), null)
})

test('a download link is the public release URL, escaped', () => {
  assert.equal(downloadUrl(REPO, TAG, 'Buun.Mail_0.6.0-beta.13_x64-setup.exe'), `https://github.com/${REPO}/releases/download/v0.6.0-beta.13/Buun.Mail_0.6.0-beta.13_x64-setup.exe`)
  assert.equal(downloadUrl(REPO, TAG, 'a b.exe'), `https://github.com/${REPO}/releases/download/v0.6.0-beta.13/a%20b.exe`)
})

test('every API URL becomes its public link, and the rest of the manifest is kept', () => {
  const manifest = {
    version: '0.6.0-beta.13',
    notes: 'Fixes',
    platforms: {
      'windows-x86_64': { signature: 'sig-w', url: api(2) },
      'darwin-aarch64': { signature: 'sig-m', url: api(1) },
      'linux-x86_64': { signature: 'sig-l', url: `https://github.com/${REPO}/releases/download/${TAG}/a.AppImage` },
    },
  }
  const assets = [
    { id: 1, name: 'Buun.Mail_0.6.0-beta.13_aarch64.app.tar.gz' },
    { id: 2, name: 'Buun.Mail_0.6.0-beta.13_x64-setup.exe' },
  ]
  const out = publicManifest(manifest, assets, REPO, TAG)
  assert.equal(out.version, '0.6.0-beta.13')
  assert.equal(out.notes, 'Fixes')
  assert.deepEqual(out.platforms['windows-x86_64'], { signature: 'sig-w', url: `https://github.com/${REPO}/releases/download/${TAG}/Buun.Mail_0.6.0-beta.13_x64-setup.exe` })
  assert.equal(out.platforms['darwin-aarch64'].url, `https://github.com/${REPO}/releases/download/${TAG}/Buun.Mail_0.6.0-beta.13_aarch64.app.tar.gz`)
  assert.equal(out.platforms['linux-x86_64'], manifest.platforms['linux-x86_64'])
})

test('a manifest or asset list of the wrong shape is refused with what is wrong', () => {
  assert.throws(() => publicManifest({}, [], REPO, TAG), /no "platforms" object/)
  assert.throws(() => publicManifest({ platforms: {} }, [{ id: '1', name: 'a' }], REPO, TAG), /array of \{ id, name \}/)
  assert.throws(() => publicManifest({ platforms: { linux: { signature: 's' } } }, [], REPO, TAG), /no URL for linux/)
})

test('an asset the release does not have is refused, so a broken manifest is never published', () => {
  assert.throws(() => publicManifest({ platforms: { 'windows-x86_64': { signature: 's', url: api(9) } } }, [], REPO, TAG), /asset 9 for windows-x86_64/)
})
