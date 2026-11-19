import { useEffect } from 'react'
import type { ReactNode } from 'react'
import type { IconType } from 'react-icons'

import { IconClose } from '../../icons'

import './Notice.css'

export interface NoticeItem {
  /** Changes with each notice, so a new one restarts the timer. */
  id: number
  text: string
  /** What happened, as a glyph beside the words. */
  glyph?: IconType
  /** Puts things back as they were, when the change can be undone. */
  undo?: () => void
}

/** How long a notice stays before it leaves on its own. */
const NOTICE_MS = 6_000

/** A short line at the foot of the window after a change, such as "Archived", with Undo when it can be undone. */
export function Notice({ notice, undoLabel, dismissLabel, onDismiss }: { notice: NoticeItem | null; undoLabel: string; dismissLabel: string; onDismiss: () => void }): ReactNode {
  useEffect(() => {
    if (notice === null) return
    const timer = window.setTimeout(onDismiss, NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice, onDismiss])

  return (
    <div className="notice-slot" aria-live="polite">
      {notice !== null && (
        <div key={notice.id} className="notice">
          {notice.glyph !== undefined && <notice.glyph aria-hidden="true" className="notice__glyph" />}
          <span className="notice__text">{notice.text}</span>
          {notice.undo !== undefined && (
            <button
              type="button"
              className="notice__undo"
              onClick={() => {
                notice.undo?.()
                onDismiss()
              }}
            >
              {undoLabel}
            </button>
          )}
          <button type="button" className="notice__close" aria-label={dismissLabel} onClick={onDismiss}>
            <IconClose aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  )
}
