import type { ReactNode } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import type { Message, Workspace } from '../../api/types'
import type { Theme } from '../../constants/ui'
import type { MessageActions } from '../../hooks/useMessageActions'
import { IconArchive, IconDelete, IconInbox, IconMarkRead, IconPutBack, IconReply, IconRoute, IconStar, IconStarred } from '../../icons'
import { formatFull } from '../../lib/time'
import { MoreFromBuun } from '../MoreFromBuun/MoreFromBuun'
import { TagEditor } from '../Tags/Tags'
import { TipButton } from '../Tooltip/TipButton'

import './Reader.css'

interface ReaderProps {
  message: Message | null
  /** The message's text, null while it loads. */
  body: string | null
  workspace: Workspace | undefined
  theme: Theme
  onAddTag: (id: string, tag: string) => void
  onRemoveTag: (id: string, tag: string) => void
  tagSuggestions: string[]
  actions: MessageActions
}

/** Why a message is where it is, in one plain sentence from the rules the router used. */
function RouteNote({ message, workspace }: { message: Message; workspace: Workspace | undefined }): ReactNode {
  const { t } = useTranslation('mail')
  if (message.matched === null) return <>{t('reader.routeUnsorted')}</>
  const address = <code>{message.matched}</code>
  if (message.folderMatched === null) return <Trans t={t} i18nKey="reader.routeWorkspace" values={{ workspace: workspace?.name ?? '' }} components={{ address }} />
  return <Trans t={t} i18nKey="reader.routeWorkspaceFolder" values={{ workspace: workspace?.name ?? '', folder: message.folder ?? '' }} components={{ address, sender: <code>{message.folderMatched}</code> }} />
}

/** The open message. With nothing open, the other Buun Group products. */
export function Reader({ message, body, workspace, theme, onAddTag, onRemoveTag, tagSuggestions, actions }: ReaderProps): ReactNode {
  const { t } = useTranslation('mail')
  if (message === null) {
    return (
      <section className="reader reader--empty" aria-label={t('reader.label')}>
        <div className="reader__empty">
          <p className="reader__nothing">{t('reader.nothingOpen')}</p>
          <MoreFromBuun theme={theme} />
        </div>
      </section>
    )
  }

  return (
    <section className="reader" aria-label={t('reader.label')}>
      <div className="reader__toolbar">
        <TipButton tip={t('reader.replySoon')} className="reader__tool" aria-disabled="true" aria-label={t('reader.replyAs', { address: message.to })}>
          <IconReply aria-hidden="true" />
        </TipButton>
        {message.shelf === 'active' ? (
          <TipButton tip={`${t('reader.archive')} (E)`} className="reader__tool" aria-label={t('reader.archive')} onClick={() => actions.archive(message)}>
            <IconArchive aria-hidden="true" />
          </TipButton>
        ) : (
          <TipButton tip={t('reader.putBack', { folder: message.folder ?? workspace?.name ?? '' })} className="reader__tool" aria-label={t('reader.putBack', { folder: message.folder ?? workspace?.name ?? '' })} onClick={() => actions.putBack(message)}>
            <IconPutBack aria-hidden="true" />
          </TipButton>
        )}
        {message.shelf === 'trashed' ? (
          <TipButton tip={t('reader.deleteForever')} className="reader__tool reader__tool--danger" aria-label={t('reader.deleteForever')} onClick={() => actions.deleteForever(message)}>
            <IconDelete aria-hidden="true" />
          </TipButton>
        ) : (
          <TipButton tip={`${t('reader.trash')} (#)`} className="reader__tool" aria-label={t('reader.trash')} onClick={() => actions.trash(message)}>
            <IconDelete aria-hidden="true" />
          </TipButton>
        )}
        <span className="reader__divider" aria-hidden="true" />
        <TipButton tip={`${message.unread ? t('actions.markRead') : t('reader.markUnread')} (U)`} className="reader__tool" aria-label={message.unread ? t('actions.markRead') : t('reader.markUnread')} onClick={() => actions.toggleRead(message)}>
          {message.unread ? <IconMarkRead aria-hidden="true" /> : <IconInbox aria-hidden="true" />}
        </TipButton>
        <TipButton tip={`${message.starred ? t('reader.unstar') : t('reader.star')} (S)`} className="reader__tool" data-on={message.starred} aria-pressed={message.starred} aria-label={t('reader.star')} onClick={() => actions.toggleStar(message)}>
          {message.starred ? <IconStarred aria-hidden="true" /> : <IconStar aria-hidden="true" />}
        </TipButton>
      </div>

      <article className="reader__message">
        <h2>{message.subject}</h2>
        <div className="reader__people">
          <span className="reader__from">{message.fromName}</span>
          <span className="reader__address">{message.from}</span>
          <time className="reader__when" dateTime={message.receivedAt}>
            {formatFull(message.receivedAt)}
          </time>
        </div>
        <p className="reader__to">
          <Trans t={t} i18nKey="reader.to" components={{ address: <span className="reader__address">{message.to}</span> }} />
        </p>
        <div className="reader__tags">
          <TagEditor tags={message.tags} suggestions={tagSuggestions} onAdd={(tag) => onAddTag(message.id, tag)} onRemove={(tag) => onRemoveTag(message.id, tag)} />
        </div>
        <p className="reader__route">
          <IconRoute aria-hidden="true" />
          <span>
            <RouteNote message={message} workspace={workspace} />
          </span>
        </p>
        <div className="reader__body" aria-busy={body === null}>
          {(body ?? message.preview).split(/\n{2,}/).map((paragraph, index) => (
            // Paragraphs have no id of their own; their order is fixed for a message.
            // eslint-disable-next-line react/no-array-index-key
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </article>
    </section>
  )
}
