import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import type { Contact, Message, MessageDetail, Recipients, Workspace } from '../../api/types'
import { Attachments } from './Attachments'
import { MessageHtml } from './MessageHtml'
import { Avatar } from '../Avatar/Avatar'
import type { Theme } from '../../constants/ui'
import type { MessageActions } from '../../hooks/useMessageActions'
import { EXPORT_GLYPHS, IconArchive, IconBack, IconCopy, IconExport, IconForward, IconReplyAll, IconDelete, IconExternal, IconInbox, IconMarkRead, IconPutBack, IconReply, IconRoute, IconStar, IconStarred, IconText } from '../../icons'
import { openExternal } from '../../api/client'
import { copyWithToast } from '../../lib/copy'
import type { ComposeMode } from '../../lib/compose'
import { domainOf } from '../../lib/sending'
import { formatFull } from '../../lib/time'
import { EXPORT_FORMATS } from '../../constants/ui'
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
  /** Its To, Cc and Reply-To headers, null while it loads. */
  recipients: Recipients | null
  /** Its HTML and attachments, null while it loads. */
  detail: MessageDetail | null
  workspace: Workspace | undefined
  theme: Theme
  onAddTag: (id: string, tag: string) => void
  onRemoveTag: (id: string, tag: string) => void
  tagSuggestions: string[]
  actions: MessageActions
  /** With the reading pane off, goes back to the list; null beside the list. */
  onBack: (() => void) | null
  /** What the list is called, for the Back button. */
  backTo: string
  /** Opens Settings at Integrations, where a sending integration is connected. */
  onOpenIntegrations: () => void
  /** Whether this message can be answered from the address it was sent to, and whether anything can send at all. */
  canReply: boolean
  canForward: boolean
  /** Starts a reply, reply all or forward of the open message. */
  onCompose: (mode: ComposeMode) => void
}

/** Why a message is where it is, in one plain sentence from the rules the router used. */
function RouteNote({ message, workspace }: { message: Message; workspace: Workspace | undefined }): ReactNode {
  const { t } = useTranslation('mail')
  if (message.matched === null) return <>{t('reader.routeUnsorted')}</>
  const address = <code>{message.matched}</code>
  if (message.folderMatched === null) return <Trans t={t} i18nKey="reader.routeWorkspace" values={{ workspace: workspace?.name ?? '' }} components={{ address }} />
  return <Trans t={t} i18nKey="reader.routeWorkspaceFolder" values={{ workspace: workspace?.name ?? '', folder: message.folder ?? '' }} components={{ address, sender: <code>{message.folderMatched}</code> }} />
}

/**
 * Reply, Reply all and Forward. Until a sending integration covers the domain the message was sent to, Reply and Reply
 * all are greyed out, say which domain needs one, and open Integrations when clicked; Forward needs any sender.
 */
function ReplyTools({ address, canReply, canForward, onCompose, onOpenIntegrations }: { address: string; canReply: boolean; canForward: boolean; onCompose: (mode: ComposeMode) => void; onOpenIntegrations: () => void }): ReactNode {
  const { t } = useTranslation('mail')
  const why = t('reader.needsSending', { domain: domainOf(address) })
  const tools = [
    { id: 'reply' as const, label: t('reader.reply'), Glyph: IconReply, on: canReply, key: 'R' },
    { id: 'replyAll' as const, label: t('reader.replyAll'), Glyph: IconReplyAll, on: canReply, key: 'A' },
    { id: 'forward' as const, label: t('reader.forward'), Glyph: IconForward, on: canForward, key: 'F' },
  ]
  return (
    <>
      {tools.map(({ id, label, Glyph, on, key }) => (
        <TipButton key={id} tip={on ? `${label} (${key})` : why} className="reader__tool" aria-disabled={!on || undefined} aria-label={label} onClick={on ? () => onCompose(id) : onOpenIntegrations}>
          <Glyph aria-hidden="true" />
        </TipButton>
      ))}
      <span className="reader__divider" aria-hidden="true" />
    </>
  )
}

/** People on a header line: each name, then the address, which copies on click. */
function People({ people }: { people: Contact[] }): ReactNode {
  return (
    <ul className="reader__people">
      {people.map((person) => (
        <li key={person.address} className="reader__person">
          {person.name !== null && <span className="reader__person-name">{person.name}</span>}
          <Copyable text={person.address} kind="email" className="reader__address" />
        </li>
      ))}
    </ul>
  )
}

/**
 * Who the message was sent to, as rows of a small table split by hairlines: To, then Cc and Reply to when it has them.
 * Before the headers load, To shows the address it was delivered to.
 */
function Fields({ message, recipients }: { message: Message; recipients: Recipients | null }): ReactNode {
  const { t } = useTranslation('mail')
  const to = recipients !== null && recipients.to.length > 0 ? recipients.to : [{ name: null, address: message.to }]
  const replyTo = (recipients?.replyTo ?? []).filter((person) => person.address !== message.from)
  const rows = [
    { id: 'to', label: t('reader.fields.to'), people: to },
    { id: 'cc', label: t('reader.fields.cc'), people: recipients?.cc ?? [] },
    { id: 'reply-to', label: t('reader.fields.replyTo'), people: replyTo },
  ].filter((row) => row.people.length > 0)
  return (
    <dl className="reader__fields" aria-label={t('reader.fields.label')}>
      {rows.map((row) => (
        <div key={row.id} className="reader__field">
          <dt>{row.label}</dt>
          <dd>
            <People people={row.people} />
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** The open message. With nothing open, the other Buun Group products. */
export function Reader({ message, body, recipients, detail, workspace, theme, onAddTag, onRemoveTag, tagSuggestions, actions, onBack, backTo, onOpenIntegrations, canReply, canForward, onCompose }: ReaderProps): ReactNode {
  const { t } = useTranslation('mail')
  const article = useRef<HTMLElement | null>(null)
  const bodyText = useRef<HTMLDivElement | null>(null)
  const [menu, setMenu] = useState<MenuRequest | null>(null)
  // Plain text instead of the sender's layout, for this message only.
  const [asText, setAsText] = useState(false)
  const [textFor, setTextFor] = useState<string | null>(null)
  if ((message?.id ?? null) !== textFor) {
    setTextFor(message?.id ?? null)
    setAsText(false)
  }
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
        {onBack !== null && (
          <>
            <TipButton tip={`${t('reader.back', { folder: backTo })} (Esc)`} className="reader__tool" aria-label={t('reader.back', { folder: backTo })} onClick={onBack}>
              <IconBack aria-hidden="true" />
            </TipButton>
            <span className="reader__divider" aria-hidden="true" />
          </>
        )}
        <ReplyTools address={message.to} canReply={canReply} canForward={canForward} onCompose={onCompose} onOpenIntegrations={onOpenIntegrations} />
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
        <span className="reader__divider" aria-hidden="true" />
        <TipButton
          tip={t('reader.exportLabel')}
          className="reader__tool"
          aria-label={t('reader.exportLabel')}
          aria-haspopup="menu"
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect()
            setMenu({
              x: box.left,
              y: box.bottom + 6,
              label: t('reader.exportLabel'),
              items: EXPORT_FORMATS.map((format) => ({ id: format.id, label: t(`export.${format.id}`), glyph: EXPORT_GLYPHS[format.id], onSelect: () => actions.exportAs(message, format.id) })),
            })
          }}
        >
          <IconExport aria-hidden="true" />
        </TipButton>
      </div>

      <article ref={attachArticle} className="reader__message">
        <h2>{message.subject}</h2>
        <div className="reader__sender">
          <Avatar name={message.fromName} address={message.from} theme={theme} size="lg" />
          <div className="reader__who">
            <span className="reader__from">{message.fromName}</span>
            <Copyable text={message.from} kind="email" className="reader__address" />
          </div>
          <time className="reader__when" dateTime={message.receivedAt}>
            {formatFull(message.receivedAt)}
          </time>
        </div>
        <Fields message={message} recipients={recipients} />
        <div className="reader__tags">
          <TagEditor tags={message.tags} suggestions={tagSuggestions} onAdd={(tag) => onAddTag(message.id, tag)} onRemove={(tag) => onRemoveTag(message.id, tag)} />
        </div>
        <p className="reader__route">
          <IconRoute aria-hidden="true" />
          <span>
            <RouteNote message={message} workspace={workspace} />
          </span>
        </p>
        {detail !== null && <Attachments messageId={message.id} attachments={detail.attachments} />}
        {detail?.html != null && !asText ? (
          <>
            <MessageHtml key={message.id} html={detail.html.html} remote={detail.html.remote} />
            <button type="button" className="reader__switch" onClick={() => setAsText(true)}>
              {t('html.showText')}
            </button>
          </>
        ) : (
          <>
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
            {detail?.html != null && (
              <button type="button" className="reader__switch" onClick={() => setAsText(false)}>
                {t('html.showHtml')}
              </button>
            )}
          </>
        )}
      </article>
      <SelectionCopy within={article} />
      {menu !== null && <ContextMenu request={menu} onClose={closeMenu} />}
    </section>
  )
}
