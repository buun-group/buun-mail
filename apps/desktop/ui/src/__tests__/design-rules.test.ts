import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const SRC = path.resolve(__dirname, '..')

function files(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const full = path.join(folder, name)
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : files(full)
    return /\.(tsx?|css|json)$/.test(name) ? [full] : []
  })
}

describe('design rules', () => {
  it('shows states as glyphs, never as dots or bullet separators', () => {
    const offenders = files(SRC).filter((file) => /__dot\b|[·•]/.test(readFileSync(file, 'utf8')))
    expect(offenders.map((file) => path.relative(SRC, file))).toEqual([])
  })
})
