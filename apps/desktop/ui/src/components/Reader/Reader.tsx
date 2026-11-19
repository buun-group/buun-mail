import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import type { Message, Workspace } from '../../api/types'
import type { Theme } from '../../constants/ui'
import type { MessageActions } from '../../hooks/useMessageActions'
import { IconArchive, IconCopy, IconDelete, IconExternal, IconInbox, IconMarkRead, IconPutBack, IconReply, IconRoute, IconStar, IconStarred, IconText } from '../../icons'
import { openExternal } from '../../api/client'
import { copyWithToast } from '../../lib/copy'
import { formatFull } from '../../lib/time'
import { tokenize } from '../../lib/tokens'
import type { CopyKind } from '../../lib/tokens'
import { ContextMenu } from '../ContextMenu/ContextMenu'
import type { MenuItem, MenuRequest } from '../ContextMenu/ContextMenu'
import { Copyable } from '../Copy/Copyable'
import { SelectionCopy } from '../Copy/SelectionCopy'
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
  const article = useRef<HTMLElement | null>(null)
  const bodyText = useRef<HTMLDivElement | null>(null)
  const [menu, setMenu] = useState<MenuRequest | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  // The menu reads the latest message and selection when it opens, so the listener is added once per article.
  const onMenu = useRef<(event: MouseEvent) => void>(() => {})
  const attachArticle = useCallback((element: HTMLElement | null) => {
    article.current = element
    if (element === null) return undefined
    const listener = (event: MouseEvent): void => onMenu.current(event)
    element.addEventListener('contextmenu', listener)
    return () => element.removeEventListener('contextmenu', listener)
  }, [])
  /** What the menu offers for a right click in the message: the selection, the word under the pointer, then the message. */
  const openMenu = (open: Message, event: MouseEvent): void => {
    event.preventDefault()
    const selected = window.getSelection()?.toString().trim() ?? ''
    const word = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-copy]') : null
    const wordText = word?.dataset['copy']
    const kind = word?.dataset['kind'] as CopyKind | undefined
    const items: MenuItem[] = []
    if (selected !== '') items.push({ id: 'copy-selection', label: t('copy.copySelection'), glyph: IconCopy, onSelect: () => void copyWithToast(selected) })
    if (wordText !== undefined && kind === 'link') {
      items.push({ id: 'open-link', label: t('copy.openLink'), glyph: IconExternal, onSelect: () => void openExternal(wordText) }, { id: 'copy-link', label: t('copy.copyLink'), glyph: IconCopy, onSelect: () => void copyWithToast(wordText) })
    } else if (wordText !== undefined) {
      items.push({ id: 'copy-word', label: kind === 'email' ? t('copy.copyEmail') : t('copy.copyCode', { code: wordText }), glyph: IconCopy, onSelect: () => void copyWithToast(wordText) })
    }
    items.push(
      {
        id: 'select-all',
        label: t('copy.selectAll'),
        glyph: IconText,
        separated: items.length > 0,
        onSelect: () => {
          if (bodyText.current !== null) window.getSelection()?.selectAllChildren(bodyText.current)
        },
      },
      { id: 'copy-body', label: t('copy.copyBody'), glyph: IconCopy, onSelect: () => void copyWithToast(body ?? open.preview) },
    )
    const forMessage = actions.menu(open).filter((item) => item.id !== 'open')
    const first = forMessage[0]
    setMenu({ x: event.clientX, y: event.clientY, label: t('copy.menuLabel'), items: [...items, ...(first === undefined ? [] : [{ ...first, separated: true }, ...forMessage.slice(1)])] })
  }

  useLayoutEffect(() => {
    onMenu.current = message === null ? () => {} : (event) => openMenu(message, event)
  })

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

      <article ref={attachArticle} className="reader__message">
        <h2>{message.subject}</h2>
        <div className="reader__people">
          <span className="reader__from">{message.fromName}</span>
          <Copyable text={message.from} kind="email" className="reader__address" />
          <time className="reader__when" dateTime={message.receivedAt}>
            {formatFull(message.receivedAt)}
          </time>
        </div>
        <p className="reader__to">
          <Trans t={t} i18nKey="reader.to" components={{ address: <Copyable text={message.to} kind="email" className="reader__address" /> }} />
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
        <div ref={bodyText} className="reader__body" aria-busy={body === null}>
          {(body ?? message.preview).split(/\n{2,}/).map((paragraph, index) => (
            // Paragraphs have no id of their own; their order is fixed for a message.
            // eslint-disable-next-line react/no-array-index-key
            <p key={index}>
              {tokenize(paragraph).map((token, at) =>
                token.kind === 'text' ? (
                  token.text
                ) : (
                  // Tokens have no id of their own; their order is fixed for a paragraph.
                  // eslint-disable-next-line react/no-array-index-key
                  <Copyable key={at} text={token.text} kind={token.kind} />
                ),
              )}
            </p>
          ))}
        </div>
      </article>
      <SelectionCopy within={article} />
      {menu !== null && <ContextMenu request={menu} onClose={closeMenu} />}
    </section>
  )
}
