/** The gap kept between a floating box and the window's edge. */
const EDGE = 8

export type Side = 'below' | 'above' | 'right'

/**
 * Where to put a floating box (a tooltip, a popover) of `size` next to `anchor`: on the preferred side, flipped above
 * when there is no room below, then slid so it stays inside the window.
 */
export function placeNear(anchor: DOMRect, size: { width: number; height: number }, side: Side, gap: number, align: 'center' | 'start' = 'center'): { left: number; top: number } {
  const fitsBelow = anchor.bottom + gap + size.height <= window.innerHeight - EDGE
  const left = align === 'start' ? anchor.left : anchor.left + (anchor.width - size.width) / 2
  const wanted =
    side === 'right'
      ? { left: anchor.right + gap, top: anchor.top + (anchor.height - size.height) / 2 }
      : { left, top: side === 'below' && fitsBelow ? anchor.bottom + gap : anchor.top - gap - size.height }
  return {
    left: Math.min(Math.max(wanted.left, EDGE), window.innerWidth - size.width - EDGE),
    top: Math.min(Math.max(wanted.top, EDGE), window.innerHeight - size.height - EDGE),
  }
}
