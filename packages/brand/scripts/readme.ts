/*
 * Draws the README's animated pictures: `pnpm --filter @buun-mail/brand readme`.
 *
 *   hero-{dark,light}.svg      the lockup, the tagline and the Built with chips
 *   routing-{dark,light}.svg   five addresses flying through the routing file into their workspaces
 *
 * Every word is outlined from Geist Medium, so the pictures look the same on any machine and GitHub needs no font.
 * The chip icons are Simple Icons paths (CC0) in readme-icons.json. Written into .github/assets/readme/ and committed;
 * run it again after changing the copy, the colours or the brand geometry.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { parse } from 'opentype.js'

const root = path.resolve(import.meta.dirname, '..')
const out = path.resolve(root, '../../.github/assets/readme')
const require = createRequire(import.meta.url)

const lockup = readFileSync(path.join(root, 'src/svg/lockup-horizontal-on-dark.svg'), 'utf8')
const word = /<g transform="translate\(52 10.53\) scale\(0.26\)" fill="#f5f5f4">(.*?)<\/g><\/svg>/s.exec(lockup)?.[1]
if (word === undefined) throw new Error('the wordmark was not found in lockup-horizontal-on-dark.svg')

const ICONS = JSON.parse(readFileSync(path.join(import.meta.dirname, 'readme-icons.json'), 'utf8')) as Record<string, string>

const font = (() => {
  const bytes = readFileSync(require.resolve('@fontsource/geist/files/geist-latin-500-normal.woff'))
  return parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
})()

interface Outline {
  d: string
  w: number
}
const outline = (text: string, size: number): Outline => ({ d: font.getPath(text, 0, 0, size).toPathData(2), w: font.getAdvanceWidth(text, size) })

/** `null` is the wider gap between the stack and the platforms. */
const CHIPS: ([slug: string, label: string] | null)[] = [['rust', 'Rust'], ['tauri', 'Tauri'], ['react', 'React'], ['typescript', 'TypeScript'], ['sqlite', 'SQLite'], null, ['linux', 'Linux'], ['apple', 'macOS'], ['windows', 'Windows']]
const WORKSPACES = ['Acme', 'Acme / Billing', 'Globex', 'Personal', 'Unsorted']

const TXT: Record<string, Outline> = {
  tag: outline('One inbox for every address you run.', 21),
  hl: outline('Delivered to', 13),
  hr: outline('Workspace and folder', 13),
  cap: outline('The envelope address survives the hop, so placing a message is a table lookup, never a guess.', 13),
}
for (const chip of CHIPS) if (chip !== null) TXT[chip[0]] = outline(chip[1], 13)
for (const name of WORKSPACES) TXT[`ws:${name}`] = outline(name, 14)
const txt = (key: string): Outline => {
  const found = TXT[key]
  if (found === undefined) throw new Error(`no outline for ${key}`)
  return found
}
const icon = (slug: string): string => {
  const found = ICONS[slug]
  if (found === undefined) throw new Error(`no icon for ${slug}`)
  return found
}

interface Theme {
  card: string
  line: string
  text: string
  muted: string
  dot: string
  dotop: string
  glow: string
  pill: string
  pillLine: string
  streak: string
  path: string
}
const THEMES: Record<string, Theme> = {
  dark: { card: '#111014', line: 'rgba(255,255,255,0.09)', text: '#f5f5f4', muted: '#a3a09a', dot: '#ffffff', dotop: '0.07', glow: '0.22', pill: '#1a191e', pillLine: 'rgba(255,255,255,0.10)', streak: '#f5f5f4', path: 'rgba(245,245,244,0.18)' },
  light: { card: '#ffffff', line: 'rgba(22,20,28,0.10)', text: '#16141c', muted: '#5f5b66', dot: '#16141c', dotop: '0.08', glow: '0.16', pill: '#f3f2f0', pillLine: 'rgba(22,20,28,0.10)', streak: '#16141c', path: 'rgba(22,20,28,0.18)' },
}

const f1 = (value: number): string => value.toFixed(1)
const f2 = (value: number): string => value.toFixed(2)

const GRAD = '<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="3" y1="3" x2="29" y2="29"><stop offset="0" stop-color="#ffc35c"/><stop offset="0.55" stop-color="#f18707"/><stop offset="1" stop-color="#b45309"/></linearGradient>'
const LETTER = '<g transform="rotate(-12 19 16)"><rect x="9.5" y="8.5" width="19" height="14.5" rx="3.2" fill="url(#g)"/><path d="M12.5 12L19 16.6L25.5 12" fill="none" stroke="#16141c" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></g>'
const MONO = "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace"
const STILL = '@media (prefers-reduced-motion: reduce){*{animation:none!important}}'

function chips(t: Theme, cx: number, y: number): string {
  const [pad, ic, gap, between, sep] = [12, 14, 7, 8, 22]
  const widths = CHIPS.map((chip) => (chip === null ? null : pad + ic + gap + txt(chip[0]).w + pad))
  const total = widths.reduce<number>((sum, width) => sum + (width ?? 0), 0) + between * (CHIPS.length - 2) + sep - between
  let x = cx - total / 2
  const parts: string[] = []
  CHIPS.forEach((chip, index) => {
    const width = widths[index]
    if (chip === null || width === null || width === undefined) {
      x += sep - between
      return
    }
    const [slug] = chip
    parts.push(`<rect x="${f1(x)}" y="${y}" width="${f1(width)}" height="30" rx="15" fill="${t.pill}" stroke="${t.pillLine}"/>`)
    parts.push(`<g transform="translate(${f1(x + pad)} ${y + 8}) scale(${(ic / 24).toFixed(4)})" fill="${t.text}"><path d="${icon(slug)}"/></g>`)
    parts.push(`<g transform="translate(${f1(x + pad + ic + gap)} ${y + 19.6})" fill="${t.text}"><path d="${txt(slug).d}"/></g>`)
    x += width + between
  })
  return parts.join('')
}

function backdrop(t: Theme, w: number, h: number, glowX: number): string {
  return `<defs>${GRAD}
<radialGradient id="glow" cx="${glowX}" cy="0.5" r="0.6"><stop offset="0" stop-color="#f18707" stop-opacity="${t.glow}"/><stop offset="1" stop-color="#f18707" stop-opacity="0"/></radialGradient>
<pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="${t.dot}" fill-opacity="${t.dotop}"/></pattern>
<clipPath id="card"><rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="20"/></clipPath></defs>
<g clip-path="url(#card)"><rect width="${w}" height="${h}" fill="${t.card}"/><rect width="${w}" height="${h}" fill="url(#dots)"/><rect width="${w}" height="${h}" fill="url(#glow)"/></g>
<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="20" fill="none" stroke="${t.line}"/>`
}

function hero(t: Theme): string {
  const [w, h, k] = [880, 300, 2.6]
  const x0 = (w - 170.54 * k) / 2
  const css = `
.letter{transform-box:fill-box;transform-origin:center;animation:arrive 1.1s cubic-bezier(.2,.8,.2,1) both,hover 3.4s ease-in-out 1.3s infinite}
.s{transform-box:fill-box;transform-origin:right center;animation:streak .9s .3s cubic-bezier(.2,.8,.2,1) both,pulse 1.8s ease-in-out 1.3s infinite}
.s2{animation-delay:.4s,1.5s}
.word{animation:rise .8s .45s cubic-bezier(.2,.8,.2,1) both}
.tag{animation:rise .8s .7s cubic-bezier(.2,.8,.2,1) both}
.foot{animation:rise .8s .9s cubic-bezier(.2,.8,.2,1) both}
@keyframes arrive{from{opacity:0;transform:translate(-26px,5px) rotate(-10deg) scale(.85)}60%{opacity:1}to{opacity:1;transform:none}}
@keyframes hover{50%{transform:translate(1.4px,-1px)}}
@keyframes streak{from{opacity:0;transform:translateX(-10px) scaleX(2.4)}}
@keyframes pulse{50%{transform:scaleX(1.55)}}
@keyframes rise{from{opacity:0;transform:translateY(8px)}}
${STILL}`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Buun Mail: one inbox for every address you run">
<title>Buun Mail</title><style>${css}</style>
${backdrop(t, w, h, 0.32)}
<g transform="translate(${f2(x0)} 70) scale(${k})">
  <g transform="scale(1.25)">
    <g class="letter">${LETTER}</g>
    <path class="s" d="M2.5 13H6.5" stroke="${t.streak}" stroke-width="3" stroke-linecap="round"/>
    <path class="s s2" d="M3.5 19.5H7" stroke="${t.streak}" stroke-width="3" stroke-linecap="round" opacity="0.55"/>
  </g>
  <g class="word"><g transform="translate(52 10.53) scale(0.26)" fill="${t.text}">${word}</g></g>
</g>
<g class="tag" transform="translate(${f1((w - txt('tag').w) / 2)} 214)" fill="${t.text}"><path d="${txt('tag').d}"/></g>
<g class="foot">${chips(t, w / 2, 236)}</g>
</svg>`
}

function routing(t: Theme): string {
  const [w, h] = [880, 330]
  const rows: [string, string][] = [['hello@acme.example', 'Acme'], ['billing@acme.example', 'Acme / Billing'], ['ci@globex.example', 'Globex'], ['me@personal.example', 'Personal'], ['old@forwarded.example', 'Unsorted']]
  const [top, gap] = [62, 52]
  const [cx, cy] = [440, 62 + gap * 2]
  const [lx, rx] = [262, 618]
  const parts: string[] = []
  const letters: string[] = []
  rows.forEach(([address, workspace], index) => {
    const y = top + gap * index
    const d = `M ${lx} ${y} C ${lx + 90} ${y}, ${cx - 110} ${cy}, ${cx - 46} ${cy} L ${cx + 46} ${cy} C ${cx + 110} ${cy}, ${rx - 90} ${y}, ${rx} ${y}`
    parts.push(`<path d="${d}" fill="none" stroke="${t.path}" stroke-width="1.5" stroke-dasharray="3 6"/>`)
    parts.push(`<rect x="38" y="${y - 17}" width="${lx - 38}" height="34" rx="10" fill="${t.pill}" stroke="${t.pillLine}"/>`)
    parts.push(`<text x="${lx - 14}" y="${y + 4.5}" text-anchor="end" style="${MONO};font-size:13px" fill="${t.text}">${address}</text>`)
    parts.push(`<rect x="${rx}" y="${y - 17}" width="${w - 38 - rx}" height="34" rx="10" fill="${t.pill}" stroke="${t.pillLine}"/>`)
    parts.push(`<g transform="translate(${rx + 16} ${y + 5})" fill="${workspace === 'Unsorted' ? t.muted : t.text}"><path d="${txt(`ws:${workspace}`).d}"/></g>`)
    const anim = `dur="4.5s" begin="${f1(index * 0.9)}s" repeatCount="indefinite"`
    letters.push(
      `<g class="fly" opacity="0"><g transform="translate(-12 -10) scale(0.62)">${LETTER}</g>` +
        `<animateMotion ${anim} path="${d}" keyPoints="0;0.5;0.5;1" keyTimes="0;0.45;0.55;1" calcMode="spline" keySplines=".45 0 .25 1;0 0 1 1;.45 0 .25 1"/>` +
        `<animate attributeName="opacity" values="0;1;1;0;0;1;1;0" keyTimes="0;0.06;0.38;0.42;0.58;0.62;0.94;1" ${anim}/></g>`,
    )
  })
  const style = `
.hub{transform-box:fill-box;transform-origin:center;animation:hub 0.9s ease-in-out infinite}
@keyframes hub{50%{transform:translateY(-1.5px)}}

@media (prefers-reduced-motion: reduce){.fly{display:none}.hub{animation:none}}`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Each message is filed by the exact address it was delivered to: a table lookup, never a guess">
<title>Routing by delivered address</title><style>${style}</style>
${backdrop(t, w, h, 0.5)}
<g transform="translate(40 31)" fill="${t.muted}"><path d="${txt('hl').d}"/></g>
<g transform="translate(${f1(w - 38 - txt('hr').w)} 31)" fill="${t.muted}"><path d="${txt('hr').d}"/></g>
${parts.join('')}
<rect x="${cx - 46}" y="${cy - 34}" width="92" height="68" rx="16" fill="${t.card}" stroke="#f18707" stroke-opacity="0.55" stroke-width="1.5"/>
<g class="hub"><g transform="translate(${cx - 24} ${cy - 26}) scale(1.5)">${LETTER}<path d="M2.5 13H6.5" stroke="${t.streak}" stroke-width="3" stroke-linecap="round"/><path d="M3.5 19.5H7" stroke="${t.streak}" stroke-width="3" stroke-linecap="round" opacity="0.55"/></g></g>
<text x="${cx}" y="${cy + 56}" text-anchor="middle" style="${MONO};font-size:11.5px" fill="${t.muted}">workspaces.toml</text>
${letters.join('')}
<g transform="translate(${f1((w - txt('cap').w) / 2)} ${h - 18})" fill="${t.muted}"><path d="${txt('cap').d}"/></g>
</svg>`
}

for (const [name, theme] of Object.entries(THEMES)) {
  writeFileSync(path.join(out, `hero-${name}.svg`), hero(theme))
  writeFileSync(path.join(out, `routing-${name}.svg`), routing(theme))
}
process.stdout.write(`wrote hero and routing pictures into ${path.relative(process.cwd(), out) || out}\n`)
