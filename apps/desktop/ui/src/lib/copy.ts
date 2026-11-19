import i18n from '../i18n'
import { IconCopy } from '../icons'
import { copyText } from './clipboard'
import { toast } from './feedback'

/** How much of the copied text a toast repeats. */
const SHOWN = 60

/** How long the tick stays, in milliseconds; matches the `copy-flash` animation. */
const TICK_MS = 900

const SVG = 'http://www.w3.org/2000/svg'

/** Where a tick should appear: the middle of what was clicked, in the layer it sits in (an open dialog is its own). */
interface Spot {
  x: number
  y: number
  layer: Element
}

function spotOf(from: Element): Spot {
  // On the control's own glyph when it has one, so the copy glyph seems to turn into the tick.
  const rect = (from.querySelector('svg') ?? from).getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, layer: from.closest('dialog') ?? document.body }
}

/** A green tick that pops over the spot and draws itself, then fades: the copy is confirmed where the person clicked. */
function flashTick(spot: Spot): void {
  const tick = document.createElement('span')
  tick.className = 'copy-flash'
  tick.setAttribute('aria-hidden', 'true')
  tick.style.left = `${spot.x}px`
  tick.style.top = `${spot.y}px`
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  const path = document.createElementNS(SVG, 'path')
  path.setAttribute('d', 'M6.5 12.5l3.75 3.75L17.5 8.75')
  svg.append(path)
  tick.append(svg)
  spot.layer.append(tick)
  window.setTimeout(() => tick.remove(), TICK_MS)
}

/**
 * Copies text and says so: a toast with what was copied and, when `from` is the clicked control, a green tick over it.
 * Says so too when the clipboard is not available. The spot is read before copying, so a control that closes on click
 * (a floating Copy button) still gets its tick.
 */
export async function copyWithToast(text: string, done = i18n.t('mail:copy.copied'), from: Element | null = null): Promise<boolean> {
  const spot = from === null ? null : spotOf(from)
  const copied = await copyText(text)
  if (copied) {
    toast({ text: done, detail: text.length > SHOWN ? `${text.slice(0, SHOWN)}...` : text, tone: 'done', glyph: IconCopy })
    if (spot !== null) flashTick(spot)
  } else {
    toast({ text: i18n.t('mail:actions.copyFailed'), tone: 'problem' })
  }
  return copied
}
