import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { createPortal } from 'react-dom'

import './Tooltip.css'

/** How long the pointer rests on a button before its tip shows. Focus shows it at once. */
const HOVER_DELAY_MS = 400

/** The gap kept between the tip and its button, and between the tip and the window's edge. */
const GAP = 6
const EDGE = 8

type Side = 'below' | 'above' | 'right'

interface TipButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** The words the tip shows, or null for none (when the button's own label is already on screen). */
  tip: string | null
  /** Where the tip prefers to sit; it flips or slides to stay inside the window. */
  side?: Side
}

/**
 * A button with our own tooltip, never the browser's `title`. The tip renders into `document.body`, so no panel's
 * overflow clips it, and it is kept inside the window.
 */
export function TipButton({ tip, side = 'below', children, onMouseEnter, onMouseLeave, onFocus, onBlur, ...button }: TipButtonProps): ReactNode {
  const id = useId()
  const timer = useRef<number | undefined>(undefined)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)

  const hide = useCallback(() => {
    window.clearTimeout(timer.current)
    setAnchor(null)
  }, [])

  useEffect(() => hide, [hide])

  return (
    <>
      <button
        type="button"
        {...button}
        aria-describedby={anchor === null ? undefined : id}
        onMouseEnter={(event) => {
          const target = event.currentTarget
          window.clearTimeout(timer.current)
          if (tip === null) return
          timer.current = window.setTimeout(() => setAnchor(target.getBoundingClientRect()), HOVER_DELAY_MS)
          onMouseEnter?.(event)
        }}
        onMouseLeave={(event) => {
          hide()
          onMouseLeave?.(event)
        }}
        onFocus={(event) => {
          if (tip !== null && event.currentTarget.matches(':focus-visible')) setAnchor(event.currentTarget.getBoundingClientRect())
          onFocus?.(event)
        }}
        onBlur={(event) => {
          hide()
          onBlur?.(event)
        }}
        onClick={(event) => {
          hide()
          button.onClick?.(event)
        }}
      >
        {children}
      </button>
      {anchor !== null && tip !== null && createPortal(<Tip id={id} anchor={anchor} side={side} text={tip} />, document.body)}
    </>
  )
}

/** The tip itself: placed beside its button, then measured and moved inside the window. */
function Tip({ id, anchor, side, text }: { id: string; anchor: DOMRect; side: Side; text: string }): ReactNode {
  const tip = useRef<HTMLDivElement | null>(null)
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const element = tip.current
    if (element === null) return
    const { width, height } = element.getBoundingClientRect()
    const fitsBelow = anchor.bottom + GAP + height <= window.innerHeight - EDGE
    const wanted =
      side === 'right'
        ? { left: anchor.right + GAP, top: anchor.top + (anchor.height - height) / 2 }
        : { left: anchor.left + (anchor.width - width) / 2, top: side === 'below' && fitsBelow ? anchor.bottom + GAP : anchor.top - GAP - height }
    setPlace({
      left: Math.min(Math.max(wanted.left, EDGE), window.innerWidth - width - EDGE),
      top: Math.min(Math.max(wanted.top, EDGE), window.innerHeight - height - EDGE),
    })
  }, [anchor, side])

  return (
    <div ref={tip} id={id} role="tooltip" className="tooltip" style={place === null ? { visibility: 'hidden' } : { left: place.left, top: place.top }}>
      {text}
    </div>
  )
}
