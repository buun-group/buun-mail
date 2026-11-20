import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { placeNear } from '../../lib/place'
import { onHideTips, tipAllowed } from '../../lib/tips'
import type { Side } from '../../lib/place'

import './Tooltip.css'

/** How long the pointer rests on a button before its tip shows. Focus shows it at once. */
const HOVER_DELAY_MS = 400

/** The gap kept between the tip and its button, room for the arrow. */
const GAP = 8

/** How close the arrow may come to the tip's corner. */
const ARROW_INSET = 10

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

  useEffect(() => {
    const stop = onHideTips(hide)
    return () => {
      stop()
      hide()
    }
  }, [hide])

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
          timer.current = window.setTimeout(() => {
            if (tipAllowed(target, 'hover')) setAnchor(target.getBoundingClientRect())
          }, HOVER_DELAY_MS)
          onMouseEnter?.(event)
        }}
        onMouseLeave={(event) => {
          hide()
          onMouseLeave?.(event)
        }}
        onFocus={(event) => {
          // Keyboard focus only: focus put back on a button as a dialog closes shows nothing.
          if (tip !== null && tipAllowed(event.currentTarget, 'focus')) setAnchor(event.currentTarget.getBoundingClientRect())
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
  useEffect(() => {
    const stop = onHideTips(hide)
    return () => {
      stop()
      hide()
    }
  }, [hide])
  return (
    <span
      ref={(element) => {
        if (element === null) return undefined
        const show = (): void => {
          window.clearTimeout(timer.current)
          timer.current = window.setTimeout(() => {
            if (tipAllowed(element, 'hover')) setAnchor(element.getBoundingClientRect())
          }, HOVER_DELAY_MS)
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

interface Placed {
  left: number
  top: number
  /** Which side of its button the tip ended up on, after flipping to fit. */
  side: 'below' | 'above' | 'right'
  /** Where along the tip's edge the arrow sits, pointing at the button's middle. */
  arrow: number
}

/**
 * The tip itself: placed beside its button, then measured and moved inside the window, with a small arrow on the edge
 * facing the button, pointing at its middle even when the tip slid to stay on screen.
 */
function Tip({ id, anchor, side, text }: { id: string; anchor: DOMRect; side: Side; text: string }): ReactNode {
  const tip = useRef<HTMLDivElement | null>(null)
  const [place, setPlace] = useState<Placed | null>(null)

  useLayoutEffect(() => {
    const element = tip.current
    if (element === null) return
    const size = element.getBoundingClientRect()
    const { left, top } = placeNear(anchor, size, side, GAP)
    const landed = side === 'right' && left >= anchor.right ? 'right' : top >= anchor.bottom ? 'below' : 'above'
    const along = landed === 'right' ? anchor.top + anchor.height / 2 - top : anchor.left + anchor.width / 2 - left
    const length = landed === 'right' ? size.height : size.width
    setPlace({ left, top, side: landed, arrow: Math.min(Math.max(along, ARROW_INSET), length - ARROW_INSET) })
  }, [anchor, side])

  return (
    <div
      ref={tip}
      id={id}
      role="tooltip"
      className="tooltip"
      data-side={place?.side}
      style={place === null ? { visibility: 'hidden' } : ({ left: place.left, top: place.top, '--tip-arrow': `${place.arrow}px` } as CSSProperties)}
    >
      {text}
    </div>
  )
}
