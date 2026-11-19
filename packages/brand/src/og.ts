/**
 * The social card, 1200 by 630: the lockup, one line on what the app does, and three addresses routed into their
 * workspaces, which is the product in one picture. Every word is outlined at build time, so it renders without fonts.
 */
import { lockupSvg } from './lockup'
import { colors } from './tokens'

export const OG = { width: 1200, height: 630 } as const

export interface OgText {
  /** Outlined headline paths, one per line, already placed. */
  headline: string
  /** Outlined route rows, already placed. */
  routes: string
}

/** A fine dot grid, the texture of the app's paper, kept faint so it never fights the words. */
function dotGrid(): string {
  return `<defs><pattern id="og-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="${colors.paper}" opacity="0.07"/></pattern></defs><rect width="${OG.width}" height="${OG.height}" fill="url(#og-dots)"/>`
}

export function ogSvg(text: OgText): string {
  const lockup = lockupSvg('horizontal', 'on-dark', 56).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '').replace(/<title>.*?<\/title>/, '')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${OG.width} ${OG.height}" width="${OG.width}" height="${OG.height}">` +
    `<rect width="${OG.width}" height="${OG.height}" fill="${colors.bodyDark}"/>${dotGrid()}` +
    `<g transform="translate(80 80)">${lockup}</g>` +
    `<g fill="${colors.paper}">${text.headline}</g>` +
    text.routes +
    `<rect x="0" y="${OG.height - 6}" width="${OG.width}" height="6" fill="${colors.brand}"/>` +
    `</svg>`
  )
}
