/**
 * Lockups: the mark beside or above the outlined "Buun Mail" wordmark. Pure strings, no font needed: the wordmark is
 * outlined at build time into `generated/wordmark.ts`.
 */
import { GRID, markBody, round } from './geometry'
import type { MarkTone } from './geometry'
import { WORDMARK } from './generated/wordmark'
import { colors } from './tokens'

export type LockupKind = 'horizontal' | 'stacked'

/** The wordmark's height as a share of the mark's, and the gap between them, both tuned by eye at 40px. */
const RATIO = { horizontalCap: 0.46, horizontalGap: 0.3, stackedCap: 0.3, stackedGap: 0.18 } as const

/** The wordmark's colour for each tone. */
function textColour(tone: MarkTone): string {
  if (tone === 'on-dark' || tone === 'white') return colors.paper
  if (tone === 'on-light' || tone === 'black') return colors.ink
  return 'currentColor'
}

/** A lockup SVG. Horizontal: `height` pixels tall. Stacked: the mark sized from `height`, the name below it. */
export function lockupSvg(kind: LockupKind, tone: MarkTone, height: number): string {
  const markSize = kind === 'horizontal' ? height : height * 0.62
  const capRatio = kind === 'horizontal' ? RATIO.horizontalCap : RATIO.stackedCap
  const scale = (height * capRatio) / WORDMARK.capHeight
  const wordWidth = WORDMARK.width * scale
  const wordHeight = WORDMARK.height * scale
  const markInner = `<g transform="scale(${round(markSize / GRID)})">${markBody(tone, `l${kind}${tone}`)}</g>`
  const word = (x: number, y: number): string => `<g transform="translate(${round(x)} ${round(y)}) scale(${round(scale)})" fill="${textColour(tone)}"><path d="${WORDMARK.d}"/></g>`

  if (kind === 'horizontal') {
    const gap = height * RATIO.horizontalGap
    const width = round(markSize + gap + wordWidth)
    const wordY = (height - wordHeight) / 2
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${round(height)}" width="${width}" height="${round(height)}" role="img" aria-label="Buun Mail"><title>Buun Mail</title>${markInner}${word(markSize + gap, wordY)}</svg>`
  }
  // Stacked: `height` sets the mark; the file grows to fit the name under it.
  const gap = height * RATIO.stackedGap
  const total = round(markSize + gap + wordHeight)
  const width = round(Math.max(markSize, wordWidth))
  const markX = (width - markSize) / 2
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${total}" width="${width}" height="${total}" role="img" aria-label="Buun Mail"><title>Buun Mail</title>` +
    `<g transform="translate(${round(markX)} 0)">${markInner}</g>${word((width - wordWidth) / 2, markSize + gap)}</svg>`
  )
}
