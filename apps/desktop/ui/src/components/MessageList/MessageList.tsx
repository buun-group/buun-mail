import type { ReactNode } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import type { Message, Place, Workspace } from '../../api/types'
import { INBOX_LABEL } from '../../constants/ui'
import { IconSearch } from '../../icons'
import { formatReceived } from '../../lib/time'
import { TagChips } from '../Tags/Tags'

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
  const { t } = useTranslation(['mail', 'common'])
  const unread = messages.filter((message) => message.unread).length
  return (
    <section className="message-list" aria-label={t('list.label')}>
      <header className="message-list__header">
        <div className="message-list__title">
          <h1>{place?.folder ?? t(INBOX_LABEL)}</h1>
          <span>{workspace?.name}</span>
        </div>
        <span className="message-list__tally">{unread > 0 ? t('list.unread', { count: unread }) : `${messages.length}`}</span>
        <label className="message-list__search">
          <IconSearch aria-hidden="true" />
          <span className="visually-hidden">{t('list.searchLabel')}</span>
          <input id="search" type="search" placeholder={t('list.searchPlaceholder')} disabled />
        </label>
      </header>
      {messages.length === 0 ? (
        <p className="message-list__empty">
          <Trans t={t} i18nKey="list.empty" components={{ addresses: <code>{workspace?.addresses.join(', ') ?? t('list.thisWorkspace')}</code> }} />
        </p>
      ) : (
        <ul className="message-list__rows">
          {messages.map((message) => (
            <li key={message.id}>
              <button type="button" className="message-row" data-unread={message.unread} aria-current={message.id === selectedId ? 'true' : undefined} onClick={() => onSelect(message)}>
                <span className="message-row__from">
                  {message.unread && <span className="message-row__dot" aria-label={t('list.unreadDot')} />}
                  {message.fromName}
                </span>
                <time className="message-row__time" dateTime={message.receivedAt}>
                  {formatReceived(message.receivedAt)}
                </time>
                <span className="message-row__subject">
                  <span className="message-row__subject-text">{message.subject}</span>
                  <TagChips tags={message.tags} />
                </span>
                <span className="message-row__preview">{message.preview}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
