import { useEffect, useRef, useState } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { IconType } from 'react-icons'

import { IconCheck, IconProblem } from '../../icons'

import { BusyGlyph } from './BusyGlyph'

import './Busy.css'

/** The shortest time a button shows it is working, so a quick answer still reads as something having happened. */
const AT_LEAST_MS = 450

/** How long the button then shows how it went. */
const SETTLED_MS = 1600

interface BusyButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children'> {
  /** The work; the button shows it is busy until this settles. */
  run: () => Promise<unknown>
  /** The glyph, which gives way to a letter in flight while the work runs. */
  glyph: IconType
  /** The words while idle. */
  children: ReactNode
  /** The words while busy, such as "Checking..."; the idle words when left out. */
  busyLabel?: ReactNode
  /** The words for a moment once it worked, such as "Sent"; the idle words when left out. */
  doneLabel?: ReactNode
}

/**
 * A button for work that takes a moment (Check now, Send a test, Refresh): pressed, its glyph becomes a letter in
 * flight and its words say so until the work is done, it cannot be pressed twice, and it stays busy at least a moment
 * so a quick answer still shows. Then, for a moment, a green tick (or a warning glyph when the work rejected) says how it went right where it
 * was pressed, whatever else is on screen; the toast the work raises gives the detail.
 */
export function BusyButton({ run, glyph: Glyph, children, busyLabel, doneLabel, className, disabled, ...rest }: BusyButtonProps): ReactNode {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle')
  const busy = state === 'busy'
  const live = useRef(true)
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])
  const press = (): void => {
    setState('busy')
    const pause = new Promise((resolve) => window.setTimeout(resolve, AT_LEAST_MS))
    void Promise.allSettled([run(), pause]).then(([outcome]) => {
      if (!live.current) return
      setState(outcome.status === 'fulfilled' ? 'done' : 'failed')
      window.setTimeout(() => {
        if (live.current) setState('idle')
      }, SETTLED_MS)
    })
  }
  const Shown = state === 'done' ? IconCheck : state === 'failed' ? IconProblem : Glyph
  const words = state === 'busy' && busyLabel !== undefined ? busyLabel : state === 'done' && doneLabel !== undefined ? doneLabel : children
  return (
    <button type="button" className={`busy-button${className === undefined ? '' : ` ${className}`}`} data-busy={busy} data-state={state} aria-busy={busy} disabled={disabled === true || busy} onClick={press} {...rest}>
      {busy ? <BusyGlyph key={state} className="busy-button__glyph" /> : <Shown key={state} aria-hidden="true" className="busy-button__glyph" />}
      <span>{words}</span>
    </button>
  )
}
