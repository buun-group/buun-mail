import type { ReactNode } from 'react'

import type { Message, Place, Workspace } from '../../api/types'
import { INBOX_LABEL } from '../../constants/ui'
import { IconSearch } from '../../icons'
import { formatReceived } from '../../lib/time'

import './MessageList.css'

interface MessageListProps {
  workspace: Workspace | undefined
  place: Place | null
  messages: Message[]
  selectedId: string | null
  onSelect: (message: Message) => void
}

/** The open folder's messages, newest first, as flat rows split by hairlines. Unread is heavier type and a dot. */
export function MessageList({ workspace, place, messages, selectedId, onSelect }: MessageListProps): ReactNode {
  const unread = messages.filter((message) => message.unread).length
  return (
    <section className="message-list" aria-label="Messages">
      <header className="message-list__header">
        <div className="message-list__title">
          <h1>{place?.folder ?? INBOX_LABEL}</h1>
          <span>{workspace?.name}</span>
        </div>
        <span className="message-list__tally">{unread > 0 ? `${unread} unread` : `${messages.length}`}</span>
        <label className="message-list__search">
          <IconSearch aria-hidden="true" />
          <span className="visually-hidden">Search this folder</span>
          <input id="search" type="search" placeholder="Search" disabled />
        </label>
      </header>
      {messages.length === 0 ? (
        <p className="message-list__empty">
          Nothing here. Mail to <code>{workspace?.addresses.join(', ') ?? 'this workspace'}</code> lands in this folder.
        </p>
      ) : (
        <ul className="message-list__rows">
          {messages.map((message) => (
            <li key={message.id}>
              <button type="button" className="message-row" data-unread={message.unread} aria-current={message.id === selectedId ? 'true' : undefined} onClick={() => onSelect(message)}>
                <span className="message-row__from">
                  {message.unread && <span className="message-row__dot" aria-label="Unread" />}
                  {message.fromName}
                </span>
                <time className="message-row__time" dateTime={message.receivedAt}>
                  {formatReceived(message.receivedAt)}
                </time>
                <span className="message-row__subject">{message.subject}</span>
                <span className="message-row__preview">{message.preview}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
