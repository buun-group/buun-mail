import { useCallback, useState } from 'react'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import type { MailView, Message, Place, Workspace } from '../../api/types'
import { INBOX_LABEL } from '../../constants/ui'
import type { Theme } from '../../constants/ui'
import { IconArchive, IconDelete, IconFolder, IconInbox, IconSearch, IconStar, IconStarred, IconUnread, isWorkspaceGlyph, WORKSPACE_GLYPHS } from '../../icons'
import { Avatar } from '../Avatar/Avatar'
import { formatReceived } from '../../lib/time'
import { ContextMenu, isMenuKey, menuPoint } from '../ContextMenu/ContextMenu'
import type { MenuItem, MenuRequest } from '../ContextMenu/ContextMenu'
import { TagChips } from '../Tags/Tags'

import './MessageList.css'

interface MessageListProps {
  workspace: Workspace | undefined
  place: Place | null
  /** A list across every workspace, shown instead of `place` while set. */
  view: MailView | null
  messages: Message[]
  selectedId: string | null
  onSelect: (message: Message) => void
  /** The right-click menu for a message. */
  menuFor: (message: Message) => MenuItem[]
  onEmptyTrash: (count: number) => void
  /** Names a workspace, for rows in a list across workspaces. */
  workspaceName: (id: string) => string
  theme: Theme
  /** The list fills the window (reading pane off): each message on one line. */
  wide: boolean
}

const VIEW_GLYPHS = { starred: IconStar, archive: IconArchive, trash: IconDelete } as const satisfies Record<MailView, unknown>

/**
 * The open folder's messages, or a view across workspaces, newest first, as flat rows split by hairlines. Unread is
 * heavier type and an envelope glyph. Right click, the menu key or Shift F10 on a row opens what can be done to it.
 */
export function MessageList({ workspace, place, view, messages, selectedId, onSelect, menuFor, onEmptyTrash, workspaceName, theme, wide }: MessageListProps): ReactNode {
  const { t } = useTranslation(['mail', 'common'])
  const [menu, setMenu] = useState<MenuRequest | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const unread = messages.filter((message) => message.unread).length
  const folderIcon = workspace?.folders.find((folder) => folder.name === place?.folder)?.icon
  const TitleGlyph = view !== null ? VIEW_GLYPHS[view] : (place?.folder ?? null) === null ? IconInbox : isWorkspaceGlyph(folderIcon) ? WORKSPACE_GLYPHS[folderIcon] : IconFolder
  const openMenu = (event: MouseEvent | KeyboardEvent, message: Message): void => {
    event.preventDefault()
    setMenu({ ...menuPoint(event), label: t('actions.menuLabel', { subject: message.subject }), items: menuFor(message) })
  }
  return (
    <section className="message-list" data-wide={wide} aria-label={t('list.label')}>
      <header className="message-list__header">
        <div className="message-list__title">
          <TitleGlyph aria-hidden="true" className="message-list__glyph" />
          <h1>{view === null ? (place?.folder ?? t(INBOX_LABEL)) : t(`views.${view}`)}</h1>
          {view === null && <span>{workspace?.name}</span>}
        </div>
        {view === 'trash' && messages.length > 0 ? (
          <button type="button" className="message-list__empty-trash" onClick={() => onEmptyTrash(messages.length)}>
            {t('list.emptyTrash')}
          </button>
        ) : (
          <span className="message-list__tally">{unread > 0 ? t('list.unread', { count: unread }) : `${messages.length}`}</span>
        )}
        <label className="message-list__search">
          <IconSearch aria-hidden="true" />
          <span className="visually-hidden">{t('list.searchLabel')}</span>
          <input id="search" type="search" placeholder={t('list.searchPlaceholder')} disabled />
        </label>
      </header>
      {messages.length === 0 ? (
        <p className="message-list__empty">
          {view === null ? <Trans t={t} i18nKey="list.empty" components={{ addresses: <code>{workspace?.addresses.join(', ') ?? t('list.thisWorkspace')}</code> }} /> : t(`list.emptyView.${view}`)}
        </p>
      ) : (
        <ul className="message-list__rows">
          {messages.map((message) => (
            <li key={message.id}>
              <button
                type="button"
                className="message-row"
                data-unread={message.unread}
                aria-current={message.id === selectedId ? 'true' : undefined}
                onClick={() => onSelect(message)}
                onContextMenu={(event) => openMenu(event, message)}
                onKeyDown={(event) => {
                  if (isMenuKey(event)) openMenu(event, message)
                }}
              >
                <Avatar name={message.fromName} address={message.from} theme={theme} />
                <span className="message-row__from">
                  {message.unread && <IconUnread className="message-row__unread" aria-label={t('list.unreadDot')} />}
                  {message.fromName}
                  {message.starred && <IconStarred className="message-row__star" aria-label={t('list.starredMark')} />}
                  {view !== null && <span className="message-row__where">{workspaceName(message.workspace)}</span>}
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
      {menu !== null && <ContextMenu request={menu} onClose={closeMenu} />}
    </section>
  )
}
