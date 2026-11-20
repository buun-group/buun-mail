import { useEffect, useRef } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'

import { DISSOLVE_MS, COLLAPSE_MS, prefersReducedMotion } from '../../lib/motion'

import './Dissolve.css'

interface DissolveOutProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  /** True to dissolve the content away. */
  out: boolean
  /** Called once the content has gone and its space has closed: remove it from the list here. */
  onDone?: () => void
  /** The element to be, so a list keeps its `li`. */
  as?: 'div' | 'li'
  children: ReactNode
}

/**
 * Wraps something about to go (an inbox that ended or was burned, a deleted message): it breaks into a grid of dots
 * that shrink away, then the space it took closes. With reduced motion it fades and closes at once. The dissolve.email
 * brand's own motion (`DissolveOut` in its brand kit), drawn the same way here.
 */
export function DissolveOut({ out, onDone, as: Element = 'div', className, children, ...rest }: DissolveOutProps): ReactNode {
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  })
  useEffect(() => {
    if (!out) return undefined
    const timer = window.setTimeout(() => done.current?.(), prefersReducedMotion() ? COLLAPSE_MS : DISSOLVE_MS + COLLAPSE_MS)
    return () => window.clearTimeout(timer)
  }, [out])
  return (
    <Element className={`dissolve-out${className === undefined ? '' : ` ${className}`}`} data-state={out ? 'out' : 'in'} aria-hidden={out || undefined} {...rest}>
      <div className="dissolve-out__inner">{children}</div>
    </Element>
  )
}
