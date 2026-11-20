import { useEffect, useRef, useState } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { IconType } from 'react-icons'

import './Busy.css'

/** The shortest time a button shows it is working, so a quick answer still reads as something having happened. */
const AT_LEAST_MS = 450

interface BusyButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children'> {
  /** The work; the button shows it is busy until this settles. */
  run: () => Promise<unknown>
  /** The glyph, which turns while the work runs. */
  glyph: IconType
  /** The words while idle. */
  children: ReactNode
  /** The words while busy, such as "Checking..."; the idle words when left out. */
  busyLabel?: ReactNode
}

/**
 * A button for work that takes a moment (Check now, Send a test, Refresh): pressed, its glyph turns and its words say
 * so until the work is done, it cannot be pressed twice, and it stays busy at least a moment so a quick answer still
 * shows. The toast the work raises says how it went.
 */
export function BusyButton({ run, glyph: Glyph, children, busyLabel, className, disabled, ...rest }: BusyButtonProps): ReactNode {
  const [busy, setBusy] = useState(false)
  const live = useRef(true)
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])
  const press = (): void => {
    setBusy(true)
    const pause = new Promise((resolve) => window.setTimeout(resolve, AT_LEAST_MS))
    void Promise.allSettled([run(), pause]).then(() => {
      if (live.current) setBusy(false)
    })
  }
  return (
    <button type="button" className={`busy-button${className === undefined ? '' : ` ${className}`}`} data-busy={busy} aria-busy={busy} disabled={disabled === true || busy} onClick={press} {...rest}>
      <Glyph aria-hidden="true" className="busy-button__glyph" />
      <span>{busy && busyLabel !== undefined ? busyLabel : children}</span>
    </button>
  )
}
