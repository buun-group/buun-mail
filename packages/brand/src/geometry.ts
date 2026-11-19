/**
 * The Arrival mark: a letter tilted in flight with two streaks behind it, a sibling of the Flung mark. Drawn once here
 * on a 32 unit grid; every SVG file, PNG, icon and React component in the kit is built from these numbers.
 */
import { colors } from './tokens'

/** The grid the mark is drawn on. */
export const GRID = 32

/** The letter: a rounded rectangle tilted about its centre, with the flap drawn as a V. */
export const LETTER = { x: 9.5, y: 8.5, width: 19, height: 14.5, radius: 3.2, tilt: -12, cx: 19, cy: 16 } as const
export const FLAP = { d: 'M12.5 12L19 16.6L25.5 12', width: 2.4 } as const

/** The two streaks behind the letter. The lower one is fainter, so the letter reads as moving away from them. */
export const STREAKS = [
  { d: 'M2.5 13H6.5', width: 3, opacity: 1 },
  { d: 'M3.5 19.5H7', width: 3, opacity: 0.55 },
] as const

/** How a mark is coloured. */
export type MarkTone =
  /** Orange letter, light streaks: for dark grounds. */
  | 'on-dark'
  /** Orange letter, ink streaks: for light grounds. */
  | 'on-light'
  /** One colour, `currentColor`, the flap cut out of the letter. */
  | 'mono'
  | 'white'
  | 'black'

/** Rounds to two places, so generated files stay short and stable. */
export const round = (value: number): number => Math.round(value * 100) / 100

/** A gradient's id, unique per drawing so two marks on one page never share one. */
function gradientDef(id: string): string {
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="3" y1="3" x2="29" y2="29"><stop offset="0" stop-color="${colors.markLight}"/><stop offset="0.55" stop-color="${colors.brand}"/><stop offset="1" stop-color="${colors.markDeep}"/></linearGradient>`
}

const letterRect = (fill: string): string => `<rect x="${LETTER.x}" y="${LETTER.y}" width="${LETTER.width}" height="${LETTER.height}" rx="${LETTER.radius}" fill="${fill}"/>`
const tilt = `rotate(${LETTER.tilt} ${LETTER.cx} ${LETTER.cy})`
const streaks = (colour: string): string => STREAKS.map((s) => `<path d="${s.d}" stroke="${colour}" stroke-width="${s.width}" stroke-linecap="round"${s.opacity === 1 ? '' : ` opacity="${s.opacity}"`}/>`).join('')

/**
 * The mark's inner drawing on the 32 grid, without the `<svg>` wrapper, so it can be placed inside an icon tile, a
 * lockup or the OG image. `id` keeps the gradient or mask unique within one document.
 */
export function markBody(tone: MarkTone, id = 'bm'): string {
  if (tone === 'on-dark' || tone === 'on-light') {
    const streakColour = tone === 'on-dark' ? colors.paper : colors.ink
    return (
      `<defs>${gradientDef(`${id}-g`)}</defs>` +
      `<g transform="${tilt}">${letterRect(`url(#${id}-g)`)}<path d="${FLAP.d}" fill="none" stroke="${colors.ink}" stroke-width="${FLAP.width}" stroke-linecap="round" stroke-linejoin="round"/></g>` +
      streaks(streakColour)
    )
  }
  const colour = tone === 'white' ? colors.white : tone === 'black' ? colors.black : 'currentColor'
  return (
    `<defs><mask id="${id}-m" maskUnits="userSpaceOnUse" x="0" y="0" width="${GRID}" height="${GRID}"><rect width="${GRID}" height="${GRID}" fill="#fff"/>` +
    `<path d="${FLAP.d}" transform="${tilt}" fill="none" stroke="#000" stroke-width="${FLAP.width}" stroke-linecap="round" stroke-linejoin="round"/></mask></defs>` +
    `<g mask="url(#${id}-m)"><g transform="${tilt}">${letterRect(colour)}</g></g>` +
    streaks(colour)
  )
}

/** A standalone mark SVG file. */
export function markSvg(tone: MarkTone, size = GRID): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID} ${GRID}" width="${size}" height="${size}" role="img" aria-label="Buun Mail"><title>Buun Mail</title>${markBody(tone)}</svg>`
}

/** The favicon: one file that switches its streaks with the browser's colour scheme. */
export function faviconSvg(): string {
  const body = markBody('on-light', 'fav').replaceAll(`stroke="${colors.ink}" stroke-width="3"`, 'class="streak" stroke-width="3"')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID} ${GRID}"><style>.streak{stroke:${colors.ink}}@media (prefers-color-scheme:dark){.streak{stroke:${colors.paper}}}</style>${body}</svg>`
}

/** How much of an app tile the mark fills, and the tile's corner radius, as fractions of the tile. */
export const TILE = { markScale: 0.66, radius: 0.225, maskableMarkScale: 0.5 } as const

/**
 * An app icon: the mark on a rounded ink tile (macOS, Windows, Linux, the dock). `maskable` fills the whole square and
 * keeps the mark inside the safe zone, for Android and PWA launchers that cut their own shape.
 */
export function tileSvg(size: number, options: { maskable?: boolean; ground?: 'ink' | 'paper' } = {}): string {
  const ground = options.ground === 'paper' ? colors.white : colors.ink
  const tone: MarkTone = options.ground === 'paper' ? 'on-light' : 'on-dark'
  const scale = options.maskable === true ? TILE.maskableMarkScale : TILE.markScale
  const markSize = size * scale
  const offset = (size - markSize) / 2
  const radius = options.maskable === true ? 0 : size * TILE.radius
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">` +
    `<rect width="${size}" height="${size}" rx="${round(radius)}" fill="${ground}"/>` +
    `<g transform="translate(${round(offset)} ${round(offset)}) scale(${round(markSize / GRID)})">${markBody(tone, `t${size}`)}</g></svg>`
  )
}
