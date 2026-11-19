import type { ReactNode } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import type { Message, Workspace } from '../../api/types'
import type { Theme } from '../../constants/ui'
import { IconArchive, IconReply, IconRoute } from '../../icons'
import { formatFull } from '../../lib/time'
import { MoreFromBuun } from '../MoreFromBuun/MoreFromBuun'
import { TagEditor } from '../Tags/Tags'

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
export function Reader({ message, body, workspace, theme, onAddTag, onRemoveTag, tagSuggestions }: ReaderProps): ReactNode {
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
        <button type="button" className="reader__tool" disabled aria-label={t('reader.replyAs', { address: message.to })}>
          <IconReply aria-hidden="true" />
        </button>
        <button type="button" className="reader__tool" disabled aria-label={t('reader.archive')}>
          <IconArchive aria-hidden="true" />
        </button>
        <span className="reader__soon">{t('reader.soon')}</span>
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
