/**
 * `node tools/updater-urls.mjs <latest.json> <assets.json> <owner/repo> <tag>`: prints the updater manifest with every
 * installer URL pointing at the release's public download link.
 *
 * tauri-action writes each URL as `https://api.github.com/repos/<repo>/releases/assets/<id>`. Those go through the
 * GitHub API, which allows 60 unauthenticated calls an hour per address, so an app on a busy network (or one that
 * checked a few times) gets `403 Forbidden` and cannot update. `https://github.com/<repo>/releases/download/<tag>/<name>`
 * is the same file with no such limit. `assets.json` is the release's asset list, as `gh api .../releases/<id>/assets`
 * prints it.
 */
import { readFileSync } from 'node:fs'

/** The id at the end of an API asset URL, or `null` for any other URL. */
export function assetId(url) {
  const match = /^https:\/\/api\.github\.com\/repos\/[^/]+\/[^/]+\/releases\/assets\/(\d+)$/.exec(url)
  return match ? Number(match[1]) : null
}

/** The public download link of one asset of a release. */
export function downloadUrl(repo, tag, name) {
  return `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`
}

/**
 * The manifest with each API asset URL replaced by its public download link. A URL that is already public is kept;
 * an API URL whose asset is not in the list throws, since a manifest pointing nowhere would break every update.
 */
export function publicManifest(manifest, assets, repo, tag) {
  if (typeof manifest !== 'object' || manifest === null || typeof manifest.platforms !== 'object' || manifest.platforms === null) {
    throw new Error('latest.json has no "platforms" object.')
  }
  if (!Array.isArray(assets) || !assets.every((asset) => Number.isInteger(asset?.id) && typeof asset?.name === 'string')) {
    throw new Error('The asset list is not an array of { id, name }.')
  }
  for (const [platform, entry] of Object.entries(manifest.platforms)) {
    if (typeof entry?.url !== 'string') throw new Error(`latest.json has no URL for ${platform}.`)
  }
  const names = new Map(assets.map((asset) => [asset.id, asset.name]))
  const platforms = Object.fromEntries(
    Object.entries(manifest.platforms).map(([platform, entry]) => {
      const id = assetId(entry.url)
      if (id === null) return [platform, entry]
      const name = names.get(id)
      if (name === undefined) throw new Error(`latest.json names asset ${id} for ${platform}, which the release does not have.`)
      return [platform, { ...entry, url: downloadUrl(repo, tag, name) }]
    }),
  )
  return { ...manifest, platforms }
}

const USAGE = 'usage: node tools/updater-urls.mjs <latest.json> <assets.json> <owner/repo> <tag>'

if (import.meta.url === `file://${process.argv[1]}`) {
  const [manifestPath, assetsPath, repo, tag] = process.argv.slice(2)
  if (!manifestPath || !assetsPath || !repo || !tag) {
    console.error(USAGE)
    process.exit(2)
  }
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const assets = JSON.parse(readFileSync(assetsPath, 'utf8'))
    process.stdout.write(`${JSON.stringify(publicManifest(manifest, assets, repo, tag), null, 2)}\n`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
