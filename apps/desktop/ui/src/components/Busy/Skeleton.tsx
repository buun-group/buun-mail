import type { ReactNode } from 'react'

import './Busy.css'

/**
 * Soft placeholder rows that shimmer while a panel's own rows load, so the space is held and the wait is visible
 * instead of an empty panel. Hidden from screen readers; the panel says `aria-busy` while it shows.
 */
export function Skeleton({ rows = 2, label }: { rows?: number; label: string }): ReactNode {
  return (
    <div className="skeleton" role="status" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        // Placeholder rows have no identity beyond their place.
        // eslint-disable-next-line react/no-array-index-key
        <div key={index} className="skeleton__row" aria-hidden="true">
          <span className="skeleton__line skeleton__line--title" />
          <span className="skeleton__line" />
          <span className="skeleton__line skeleton__line--short" />
        </div>
      ))}
    </div>
  )
}
