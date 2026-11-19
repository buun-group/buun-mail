// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { icoSizes } from '../../scripts/ico'
import { markSvg, tileSvg } from '../geometry'
import { colors } from '../tokens'

const at = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url))
const APP_TOKENS = readFileSync(at('../../../../apps/desktop/ui/src/styles/tokens.css'), 'utf8')
const MOTION = readFileSync(at('../css/motion.css'), 'utf8')

describe('the colours', () => {
  it('match the app tokens', () => {
    expect(APP_TOKENS).toContain(`--brand-100: ${colors.brand}`)
    expect(APP_TOKENS).toContain(`--mark-light: ${colors.markLight}`)
    expect(APP_TOKENS).toContain(`--mark-deep: ${colors.markDeep}`)
    expect(APP_TOKENS).toContain(`--mark-ink: ${colors.ink}`)
  })
})

describe('the drawings', () => {
  it('keep the mono mark to one colour', () => {
    const svg = markSvg('mono')
    expect(svg).toContain('currentColor')
    expect(svg).not.toContain(colors.brand)
  })

  it('round every tile corner except the maskable one', () => {
    expect(tileSvg(512)).toMatch(/rx="115\.2"/)
    expect(tileSvg(512, { maskable: true })).toMatch(/rx="0"/)
  })
})

describe('the built files', () => {
  const ASSETS = ['favicon.ico', 'favicon-16.png', 'favicon-32.png', 'favicon-48.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'maskable-512.png', 'app-icon-1024.png', 'og-default.png', 'email-logo-dark.png', 'email-logo-dark@2x.png', 'email-logo-light.png', 'email-logo-light@2x.png', 'site.webmanifest']

  it.each(ASSETS)('%s exists', (name) => {
    expect(existsSync(at(`../../assets/${name}`))).toBe(true)
  })

  it('packs three sizes into favicon.ico', () => {
    expect(icoSizes(readFileSync(at('../../assets/favicon.ico')))).toEqual([16, 32, 48])
  })

  it('outlined the wordmark, so no logo needs the font', () => {
    expect(readFileSync(at('../../src/svg/lockup-horizontal-on-dark.svg'), 'utf8')).not.toContain('<text')
  })
})

describe('the motion', () => {
  it.each(['arrive', 'loader', 'send', 'ping', 'draw'])('has bm-%s', (motion) => {
    expect(MOTION).toContain(`.bm-${motion} `)
  })

  it('rests under reduced motion', () => {
    expect(MOTION).toContain('@media (prefers-reduced-motion: reduce)')
  })
})
