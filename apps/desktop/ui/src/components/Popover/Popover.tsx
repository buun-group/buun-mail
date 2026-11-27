import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { placeNear } from '../../lib/place'

import './Popover.css'
import { holdAndLeave } from '../../lib/motion'

/** The gap between the button and the box under it. */
const GAP = 6

/**
 * A small box under the button that opened it, kept inside the window, such as Jump to's dates. Escape or a click
 * elsewhere closes it, focus starts on its first control and goes back to the button after.
 */
export function Popover({ anchor, label, onClose, children }: { anchor: HTMLElement; label: string; onClose: () => void; children: ReactNode }): ReactNode {
  const box = useRef<HTMLDivElement | null>(null)
  const boxRef = useCallback((element: HTMLDivElement | null) => holdAndLeave(box, element), [])
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const element = box.current
    if (element === null) return
    const { width, height } = element.getBoundingClientRect()
    setPlace(placeNear(anchor.getBoundingClientRect(), { width, height }, 'below', GAP, 'end'))
    element.querySelector<HTMLElement>('button, input')?.focus()
  }, [anchor])

  useEffect(() => {
    const away = (event: Event): void => {
      const target = event.target
      if (!(target instanceof Node)) return onClose()
      // A drop-down opened from inside the box lists its options outside it, in the page body ([data-floating]).
      const floating = target instanceof Element && target.closest('[data-floating]') !== null
      if (!(floating || box.current?.contains(target) === true || anchor.contains(target))) onClose()
    }
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('pointerdown', away, true)
    window.addEventListener('keydown', escape, true)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('pointerdown', away, true)
      window.removeEventListener('keydown', escape, true)
      window.removeEventListener('resize', onClose)
      anchor.focus()
    }
  }, [anchor, onClose])

  return createPortal(
    <div ref={boxRef} className="popover" role="dialog" aria-label={label} style={place === null ? { visibility: 'hidden' } : { left: place.left, top: place.top }}>
      {children}
    </div>,
    document.body,
  )
}
