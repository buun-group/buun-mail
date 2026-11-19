import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { threadMessages } from '../../api/client'
import type { Message } from '../../api/types'
import type { Theme } from '../../constants/ui'
import { IconConversation } from '../../icons'
import { formatListed } from '../../lib/time'
import { Avatar } from '../Avatar/Avatar'

/**
 * The rest of the open message's conversation, oldest first, above it: who wrote, when, and their first words, the
 * open one marked. Replies sent from here are part of it. A click opens that message.
 */
export function Conversation({ message, theme, onOpen }: { message: Message; theme: Theme; onOpen: (message: Message) => void }): ReactNode {
  const { t } = useTranslation('mail')
  const [thread, setThread] = useState<Message[]>([])
  const threadId = message.threadId
  const size = message.threadSize

  useEffect(() => {
    if (threadId === null || size < 2) return
    let current = true
    threadMessages(threadId)
      .then((found) => {
        if (current) setThread(found)
      })
      .catch(() => setThread([]))
    return () => {
      current = false
    }
  }, [threadId, size])

  if (threadId === null || size < 2 || thread.length < 2) return null
  return (
    <section className="conversation" aria-label={t('conversation.label')}>
      <h3 className="conversation__title">
        <IconConversation aria-hidden="true" />
        {t('conversation.label')}
        <span>{t('conversation.count', { count: thread.length })}</span>
      </h3>
      <ol className="conversation__list">
        {thread.map((item) => {
          const who = item.folder === 'Sent' ? t('conversation.sentBy') : item.fromName
          return (
            <li key={item.id}>
              <button
                type="button"
                className="conversation__item"
                aria-current={item.id === message.id ? 'true' : undefined}
                aria-label={t('conversation.open', { who, when: formatListed(item.receivedAt) })}
                onClick={() => {
                  if (item.id !== message.id) onOpen(item)
                }}
              >
                <Avatar name={item.fromName} address={item.from} theme={theme} />
                <span className="conversation__words">
                  <span className="conversation__who">{who}</span>
                  <span className="conversation__preview">{item.preview}</span>
                </span>
                <time className="conversation__when" dateTime={item.receivedAt}>
                  {formatListed(item.receivedAt)}
                </time>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
