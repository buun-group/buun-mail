import { useEffect, useRef, useState } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'

import { burnAway } from '../../lib/burn'
import { COLLAPSE_MS } from '../../lib/motion'

import './Dissolve.css'

interface DissolveOutProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  /** True to burn the content away. */
  out: boolean
  /** Called once the content has gone and its space has closed: remove it from the list here. */
  onDone?: () => void
  /** The element to be, so a list keeps its `li`. */
  as?: 'div' | 'li'
  children: ReactNode
}

/**
 * Wraps something about to go (an inbox that ended or was burned, a deleted message): it burns away as dissolve.email
 * burns an inbox, a glowing edge in the brand's colours crossing it, embers rising and the content breaking into dust,
 * then the space it took closes. Without WebGL it fades with a little blur; with reduced motion it simply fades.
 */
export function DissolveOut({ out, onDone, as: Element = 'div', className, children, ...rest }: DissolveOutProps): ReactNode {
  const inner = useRef<HTMLDivElement | null>(null)
  const done = useRef(onDone)
  const [closing, setClosing] = useState(false)
  useEffect(() => {
    done.current = onDone
  })
  useEffect(() => {
    const element = inner.current
    if (!out || element === null) return undefined
    let live = true
    let timer = 0
    void burnAway(element).then(() => {
      if (!live) return
      setClosing(true)
      timer = window.setTimeout(() => done.current?.(), COLLAPSE_MS)
    })
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [out])
  return (
    <Element className={`dissolve-out${className === undefined ? '' : ` ${className}`}`} data-state={!out ? 'in' : closing ? 'closing' : 'out'} aria-hidden={out || undefined} {...rest}>
      <div ref={inner} className="dissolve-out__inner">
        {children}
      </div>
    </Element>
  )
}
