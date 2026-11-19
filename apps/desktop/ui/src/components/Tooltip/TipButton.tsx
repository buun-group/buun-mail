import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { placeNear } from '../../lib/place'
import type { Side } from '../../lib/place'

import './Tooltip.css'

/** How long the pointer rests on a button before its tip shows. Focus shows it at once. */
const HOVER_DELAY_MS = 400

/** The gap kept between the tip and its button. */
const GAP = 6

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

/**
 * Words with our tooltip on pointer rest, for text inside another control (a list row is already a button, so its parts
 * cannot be buttons). Not focusable: the control carries the same words for keyboards and screen readers.
 */
export function TipSpan({ tip, side = 'below', className, children }: { tip: string; side?: Side; className?: string; children: ReactNode }): ReactNode {
  const timer = useRef<number | undefined>(undefined)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const hide = useCallback(() => {
    window.clearTimeout(timer.current)
    setAnchor(null)
  }, [])
  useEffect(() => hide, [hide])
  return (
    <span
      ref={(element) => {
        if (element === null) return undefined
        const show = (): void => {
          window.clearTimeout(timer.current)
          timer.current = window.setTimeout(() => setAnchor(element.getBoundingClientRect()), HOVER_DELAY_MS)
        }
        element.addEventListener('mouseenter', show)
        element.addEventListener('mouseleave', hide)
        return () => {
          element.removeEventListener('mouseenter', show)
          element.removeEventListener('mouseleave', hide)
        }
      }}
      className={className}
    >
      {children}
      {anchor !== null && createPortal(<Tip id={`${tip.length}-tip`} anchor={anchor} side={side} text={tip} />, document.body)}
    </span>
  )
}

/** The tip itself: placed beside its button, then measured and moved inside the window. */
function Tip({ id, anchor, side, text }: { id: string; anchor: DOMRect; side: Side; text: string }): ReactNode {
  const tip = useRef<HTMLDivElement | null>(null)
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const element = tip.current
    if (element === null) return
    setPlace(placeNear(anchor, element.getBoundingClientRect(), side, GAP))
  }, [anchor, side])

  return (
    <div ref={tip} id={id} role="tooltip" className="tooltip" style={place === null ? { visibility: 'hidden' } : { left: place.left, top: place.top }}>
      {text}
    </div>
  )
}
