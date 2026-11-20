import type { ReactNode } from 'react'

import { usePresence } from '../../hooks/usePresence'

import './Fold.css'

interface FoldProps {
  open: boolean
  children: ReactNode
  id?: string
  className?: string
}

/**
 * A part that folds open and shut: its height slides from nothing to its content and back, with a soft fade, instead
 * of snapping. Its content is mounted only while open or closing, as a plain `open && ...` would.
 */
export function Fold({ open, children, id, className }: FoldProps): ReactNode {
  const { mounted, phase, settle } = usePresence(open)
  if (!mounted) return null
  return (
    <div
      id={id}
      className={`fold${className === undefined ? '' : ` ${className}`}`}
      data-phase={phase}
      inert={phase === 'closing'}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) settle()
      }}
    >
      <div className="fold__inner">{children}</div>
    </div>
  )
}
