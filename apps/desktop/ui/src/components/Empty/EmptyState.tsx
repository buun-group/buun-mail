import type { ReactNode } from 'react'
import type { IconType } from 'react-icons'

import { Mark } from '@buun-mail/brand/react'

import './EmptyState.css'

/**
 * Nothing to show yet, said warmly: the letter arriving onto a soft landing pad, the words, a quieter hint, and at
 * most one useful thing to do (copy the address mail should go to, say).
 */
export function EmptyState({
  words,
  hint,
  action,
  compact = false,
}: {
  words: ReactNode
  hint?: ReactNode
  action?: { label: string; glyph: IconType; run: (from: HTMLElement) => void }
  /** Smaller, for a list rather than a whole pane. */
  compact?: boolean
}): ReactNode {
  const Glyph = action?.glyph
  return (
    <div className="empty-state" data-compact={compact}>
      <span className="empty-state__art" aria-hidden="true">
        <Mark size={compact ? 30 : 40} motion="arrive" />
      </span>
      <p className="empty-state__words">{words}</p>
      {hint !== undefined && <p className="empty-state__hint">{hint}</p>}
      {action !== undefined && Glyph !== undefined && (
        <button type="button" className="empty-state__action" onClick={(event) => action.run(event.currentTarget)}>
          <Glyph aria-hidden="true" />
          {action.label}
        </button>
      )}
    </div>
  )
}
