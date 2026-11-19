import type { ReactNode } from 'react'

import type { Message, Place, Workspace } from '../../api/types'
import { INBOX_LABEL } from '../../constants/ui'
import { formatReceived } from '../../lib/time'

import './MessageList.css'

interface MessageListProps {
  workspace: Workspace | undefined
  place: Place | null
  messages: Message[]
  selectedId: string | null
  onSelect: (message: Message) => void
}

/** The open folder's messages, newest first. Unread ones carry an orange edge and heavier type. */
export function MessageList({ workspace, place, messages, selectedId, onSelect }: MessageListProps): ReactNode {
  return (
    <section className="message-list" aria-label="Messages">
      <header className="message-list__header">
        <h1>{place?.folder ?? INBOX_LABEL}</h1>
        <p>{workspace?.name}</p>
      </header>
      {messages.length === 0 ? (
        <p className="message-list__empty">Nothing here yet. Mail to {workspace?.addresses.join(' or ') ?? 'this workspace'} lands here.</p>
      ) : (
        <ul>
          {messages.map((message) => {
            const classes = ['message-row', message.unread ? 'message-row--unread' : '', message.id === selectedId ? 'message-row--selected' : ''].filter(Boolean).join(' ')
            return (
              <li key={message.id}>
                <button type="button" className={classes} aria-current={message.id === selectedId ? 'true' : undefined} onClick={() => onSelect(message)}>
                  <span className="message-row__top">
                    <span className="message-row__from">{message.fromName}</span>
                    <time className="message-row__time" dateTime={message.receivedAt}>
                      {formatReceived(message.receivedAt)}
                    </time>
                  </span>
                  <span className="message-row__subject">{message.subject}</span>
                  <span className="message-row__preview">{message.preview}</span>
                  <span className="message-row__to">{message.to}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
