import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Mark } from '@buun-mail/brand/react'

import type { Message } from '../../api/types'
import { IconClose } from '../../icons'

import './Toasts.css'

interface ToastsProps {
  toasts: Message[]
  workspaceName: (id: string) => string
  onOpen: (message: Message) => void
  onDismiss: (id: string) => void
}

/** New mail while the window is in front: a short stack in the corner, newest on top. Each leaves on its own. */
export function Toasts({ toasts, workspaceName, onOpen, onDismiss }: ToastsProps): ReactNode {
  const { t } = useTranslation('notifications')
  return (
    <section className="toasts" aria-live="polite" aria-label={t('toasts.label')}>
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
    </section>
  )
}
