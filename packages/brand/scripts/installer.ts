/*
 * Draws the Windows installers' artwork from the brand: `pnpm --filter @buun-mail/brand installer`.
 *
 *   nsis-header.bmp    150 x 57    the strip at the top of the setup.exe's inner pages
 *   nsis-sidebar.bmp   164 x 314   the panel on its welcome and finish pages
 *   wix-banner.bmp     493 x 58    the strip at the top of the .msi's pages
 *   wix-dialog.bmp     493 x 312   the backdrop of the .msi's welcome and finish pages (art on the left 164 px)
 *
 * Written into apps/desktop/src-tauri/icons/installer/ as 24-bit BMPs, the only format both installers take, and
 * committed. tauri.conf.json points the NSIS and WiX bundles at them; the installer's own icon is icons/icon.ico.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { Resvg } from '@resvg/resvg-js'

import { markSvg } from '../src/geometry'
import { lockupSvg } from '../src/lockup'
import { colors } from '../src/tokens'

const out = path.resolve(import.meta.dirname, '../../../apps/desktop/src-tauri/icons/installer')
mkdirSync(out, { recursive: true })

/** An SVG file placed inside another at x, y, scaled to `height`. */
function place(svg: string, x: number, y: number, height: number): string {
  const [, w = '1', h = '1'] = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg) ?? []
  const width = (Number(w) / Number(h)) * height
  return svg.replace(/<svg ([^>]*?)width="[\d.]+" height="[\d.]+"/, `<svg $1x="${x}" y="${y}" width="${width.toFixed(2)}" height="${height}"`)
}

/** The width an SVG file takes at `height`. */
function widthAt(svg: string, height: number): number {
  const [, w = '1', h = '1'] = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg) ?? []
  return (Number(w) / Number(h)) * height
}

/** The height an SVG file takes at `width`. */
function heightAt(svg: string, width: number): number {
  return (width / widthAt(svg, 1))
}

/** A 24-bit, bottom-up BMP of an SVG drawn at its own size on an opaque ground. */
function bmp(svg: string, width: number, height: number): Buffer {
  const pixels = new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: false } }).render().pixels
  const stride = Math.ceil((width * 3) / 4) * 4
  const size = 54 + stride * height
  const file = Buffer.alloc(size)
  file.write('BM', 0, 'ascii')
  file.writeUInt32LE(size, 2)
  file.writeUInt32LE(54, 10)
  file.writeUInt32LE(40, 14)
  file.writeInt32LE(width, 18)
  file.writeInt32LE(height, 22)
  file.writeUInt16LE(1, 26)
  file.writeUInt16LE(24, 28)
  file.writeUInt32LE(stride * height, 34)
  file.writeInt32LE(2835, 38)
  file.writeInt32LE(2835, 42)
  for (let y = 0; y < height; y++) {
    const row = 54 + (height - 1 - y) * stride
    for (let x = 0; x < width; x++) {
      const from = (y * width + x) * 4
      file[row + x * 3] = pixels[from + 2] ?? 0
      file[row + x * 3 + 1] = pixels[from + 1] ?? 0
      file[row + x * 3 + 2] = pixels[from] ?? 0
    }
  }
  return file
}

const frame = (width: number, height: number, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${body}</svg>`

/** The dark ground with Buun orange glowing from one corner, as the README's cards. */
const darkGround = (width: number, height: number, cx: number, cy: number): string =>
  `<defs><radialGradient id="glow" cx="${cx}" cy="${cy}" r="0.75"><stop offset="0" stop-color="${colors.brand}" stop-opacity="0.32"/><stop offset="1" stop-color="${colors.brand}" stop-opacity="0"/></radialGradient></defs>` +
  `<rect width="${width}" height="${height}" fill="${colors.ink}"/><rect width="${width}" height="${height}" fill="url(#glow)"/>`

const written: string[] = []
function write(name: string, svg: string, width: number, height: number): void {
  writeFileSync(path.join(out, name), bmp(svg, width, height))
  written.push(name)
}

// NSIS header: the light lockup, right-aligned, on the white the pages use.
{
  const [w, h] = [150, 57]
  const lockup = lockupSvg('horizontal', 'on-light', 24)
  write('nsis-header.bmp', frame(w, h, `<rect width="${w}" height="${h}" fill="${colors.white}"/>${place(lockup, w - widthAt(lockup, 24) - 10, (h - 24) / 2, 24)}`), w, h)
}

// NSIS sidebar: the stacked lockup on the dark ground, a little above the middle.
{
  const [w, h] = [164, 314]
  const lockup = lockupSvg('stacked', 'on-dark', 96)
  const lh = heightAt(lockup, 124)
  write('nsis-sidebar.bmp', frame(w, h, `${darkGround(w, h, 0.5, 0.32)}${place(lockup, (w - 124) / 2, 96, lh)}`), w, h)
}

// WiX banner: white, the mark on the right where the text leaves room.
{
  const [w, h] = [493, 58]
  write('wix-banner.bmp', frame(w, h, `<rect width="${w}" height="${h}" fill="${colors.white}"/>${place(markSvg('on-light'), w - 52, 9, 40)}`), w, h)
}

// WiX dialog: the left 164 px as the NSIS sidebar, the rest white for the installer's words.
{
  const [w, h] = [493, 312]
  const lockup = lockupSvg('stacked', 'on-dark', 96)
  const lh = heightAt(lockup, 124)
  const art = `<svg x="0" y="0" width="164" height="${h}">${darkGround(164, h, 0.5, 0.32)}${place(lockup, 20, 96, lh)}</svg>`
  write('wix-dialog.bmp', frame(w, h, `<rect width="${w}" height="${h}" fill="${colors.white}"/>${art}`), w, h)
}

process.stdout.write(`Wrote ${written.length} installer images into ${path.relative(process.cwd(), out)}:\n${written.map((file) => `  ${file}`).join('\n')}\n`)
