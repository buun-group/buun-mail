import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Mark } from '@buun-mail/brand/react'

import type { Message } from '../../api/types'
import { IconClose, IconDone, IconInfo, IconProblem } from '../../icons'
import { dismissFeedback, useFeedback } from '../../lib/feedback'
import type { Feedback, FeedbackTone } from '../../lib/feedback'

import './Toasts.css'

/**
 * True where the engine has popovers. The stack then renders inside the topmost open dialog, so the dialog does not make
 * it inert and it can be clicked, and is also a manual popover in the top layer, lifted above the dialog, so the
 * dialog cannot clip it (WebKit gives an open dialog `overflow: auto`, which hides a fixed element inside it).
 */
const POPOVERS = typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype

/**
 * Opens the stack in the top layer, above the dialog it renders in. A callback ref, so it runs each time the stack
 * mounts, which it does again in each new host as dialogs open and close.
 */
function lift(element: HTMLElement | null): void {
  if (!POPOVERS || element === null || !element.isConnected) return
  if (element.matches(':popover-open')) element.hidePopover()
  element.showPopover()
}

/** The newest open modal dialog, which sits above the page, or the page itself when none is open. */
function topmost(): HTMLElement {
  const open = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')]
  return open.at(-1) ?? document.body
}

const TONE_GLYPHS = { done: IconDone, info: IconInfo, problem: IconProblem } as const satisfies Record<FeedbackTone, unknown>

interface ToastsProps {
  toasts: Message[]
  workspaceName: (id: string) => string
  onOpen: (message: Message) => void
  onDismiss: (id: string) => void
  /** Shown first and kept until it goes on its own terms, such as the pop-up for a newer version. */
  pinned?: ReactNode
}

/**
 * The bottom right corner: new mail while the window is in front, and what just happened (archived, copied, a gateway
 * checked). Each leaves on its own with a short animation. While a dialog such as Settings is open the stack renders
 * inside it, so it shows above the dialog and can be clicked, in every engine.
 */
export function Toasts({ toasts, workspaceName, onOpen, onDismiss, pinned }: ToastsProps): ReactNode {
  const { t } = useTranslation('notifications')
  const feedback = useFeedback()
  const [host, setHost] = useState<HTMLElement>(topmost)

  // Follows dialogs opening and closing, so the stack renders inside the one on top.
  useEffect(() => {
    const watcher = new MutationObserver(() => setHost(topmost()))
    watcher.observe(document.body, { attributes: true, attributeFilter: ['open'], subtree: true })
    return () => watcher.disconnect()
  }, [])


  return createPortal(
    <section ref={lift} className="toasts" aria-live="polite" aria-label={t('toasts.label')} popover={POPOVERS ? 'manual' : undefined}>
      {pinned}
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
    </section>,
    host,
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
        <span className="toast__text">
          {item.text}
          {item.count > 1 && <span className="toast__count">{item.count}</span>}
        </span>
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
