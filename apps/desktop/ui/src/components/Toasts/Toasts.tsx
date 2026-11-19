import { useEffect, useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Mark } from '@buun-mail/brand/react'

import type { Message } from '../../api/types'
import { IconClose, IconDone, IconInfo, IconProblem } from '../../icons'
import { dismissFeedback, useFeedback } from '../../lib/feedback'
import type { Feedback, FeedbackTone } from '../../lib/feedback'

import './Toasts.css'

/** The top layer, where the engine has it (older WebKitGTK and jsdom do not); without it the stack is a fixed layer. */
const TOP_LAYER = typeof HTMLElement !== 'undefined' && typeof HTMLElement.prototype.showPopover === 'function'

const TONE_GLYPHS = { done: IconDone, info: IconInfo, problem: IconProblem } as const satisfies Record<FeedbackTone, unknown>

interface ToastsProps {
  toasts: Message[]
  workspaceName: (id: string) => string
  onOpen: (message: Message) => void
  onDismiss: (id: string) => void
}

/**
 * The bottom right corner: new mail while the window is in front, and what just happened (archived, copied, a gateway
 * checked). Each leaves on its own with a short animation. The stack sits in the top layer, so it shows over settings.
 */
export function Toasts({ toasts, workspaceName, onOpen, onDismiss }: ToastsProps): ReactNode {
  const { t } = useTranslation('notifications')
  const feedback = useFeedback()
  const stack = useRef<HTMLElement | null>(null)
  const count = toasts.length + feedback.length

  // In the top layer the newest entry wins, so the stack is shown again whenever it changes or a dialog opens.
  const front = useRef(() => {})
  useLayoutEffect(() => {
    front.current = () => {
      const element = stack.current
      if (element === null || !TOP_LAYER) return
      if (element.matches(':popover-open')) element.hidePopover()
      if (count > 0) element.showPopover()
    }
    front.current()
  }, [count])

  useEffect(() => {
    if (!TOP_LAYER) return
    const watcher = new MutationObserver((changes) => {
      if (changes.some((change) => change.target instanceof HTMLDialogElement && change.target.open)) front.current()
    })
    watcher.observe(document.body, { attributes: true, attributeFilter: ['open'], subtree: true })
    return () => watcher.disconnect()
  }, [])

  return (
    <section ref={stack} className="toasts" popover={TOP_LAYER ? 'manual' : undefined} aria-live="polite" aria-label={t('toasts.label')}>
      {toasts.map((message) => (
        <div key={message.id} className="toast">
          <button
            type="button"
            className="toast__body"
            onClick={() => {
              onDismiss(message.id)
              onOpen(message)
            }}
          >
            <Mark size={22} motion="ping" />
            <span className="toast__words">
              <span className="toast__top">
                <strong>{message.fromName}</strong>
                <span>{workspaceName(message.workspace)}</span>
              </span>
              <span className="toast__subject">{message.subject}</span>
            </span>
          </button>
          <button type="button" className="toast__close" aria-label={t('toasts.dismiss')} onClick={() => onDismiss(message.id)}>
            <IconClose aria-hidden="true" />
          </button>
        </div>
      ))}
      {feedback.map((item) => (
        <FeedbackToast key={item.id} item={item} undoLabel={t('toasts.undo')} dismissLabel={t('toasts.dismiss')} />
      ))}
    </section>
  )
}

function FeedbackToast({ item, undoLabel, dismissLabel }: { item: Feedback; undoLabel: string; dismissLabel: string }): ReactNode {
  const Glyph = item.glyph ?? TONE_GLYPHS[item.tone]
  return (
    <div className="toast toast--feedback" data-tone={item.tone} data-leaving={item.leaving} role={item.tone === 'problem' ? 'alert' : 'status'}>
      <span className="toast__glyph">
        <Glyph aria-hidden="true" />
      </span>
      <span className="toast__words">
        <span className="toast__text">{item.text}</span>
        {item.detail !== undefined && <span className="toast__detail">{item.detail}</span>}
      </span>
      {item.undo !== undefined && (
        <button
          type="button"
          className="toast__undo"
          onClick={() => {
            item.undo?.()
            dismissFeedback(item.id)
          }}
        >
          {undoLabel}
        </button>
      )}
      <button type="button" className="toast__close" aria-label={dismissLabel} onClick={() => dismissFeedback(item.id)}>
        <IconClose aria-hidden="true" />
      </button>
    </div>
  )
}
