import { useCallback, useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import type { MailView, Message, Place, Workspace } from '../../api/types'
import { INBOX_LABEL } from '../../constants/ui'
import type { ListFilter, ListSort, Theme } from '../../constants/ui'
import type { WorkspaceLooks } from '../../hooks/useWorkspaceLooks'
import { endOfDay, sortMessages } from '../../lib/sort'
import { WorkspaceIcon } from '../WorkspaceIcon/WorkspaceIcon'
import { ListTools } from './ListTools'
import { IconArchive, IconCaret, IconDelete, IconRename, IconFolder, IconInbox, IconSearch, IconStar, IconStarred, IconUnread, isWorkspaceGlyph, WORKSPACE_GLYPHS } from '../../icons'
import { Avatar } from '../Avatar/Avatar'
import { formatListed } from '../../lib/time'
import { ContextMenu, isMenuKey, menuPoint } from '../ContextMenu/ContextMenu'
import type { MenuRequest } from '../ContextMenu/ContextMenu'
import type { MessageActions } from '../../hooks/useMessageActions'
import { ListHeader } from './ListHeader'
import { QuickActions } from './QuickActions'
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
  /** Everything that can be done to a message: its right-click menu, its quick actions, emptying the trash. */
  actions: MessageActions
  /** Names a workspace, for rows in a list across workspaces. */
  workspaceName: (id: string) => string
  theme: Theme
  sort: ListSort
  onSort: (sort: ListSort) => void
  filter: ListFilter
  onFilter: (filter: ListFilter) => void
  /** How many messages the folder holds before the filter, to tell an empty folder from a filtered one. */
  total: number
  looks: WorkspaceLooks
  /** The search box's words; the list shows only what matches them. */
  query: string
  onQuery: (query: string) => void
  /** The list fills the window (reading pane off): each message on one line. */
  wide: boolean
}

const VIEW_GLYPHS = { starred: IconStar, archive: IconArchive, trash: IconDelete, drafts: IconRename } as const satisfies Record<MailView, unknown>

/**
 * The open folder's messages, or a view across workspaces, newest first, as flat rows split by hairlines. Unread is
 * heavier type and an envelope glyph. Right click, the menu key or Shift F10 on a row opens what can be done to it.
 */
export function MessageList({ workspace, place, view, messages, selectedId, onSelect, actions, workspaceName, theme, sort, onSort, filter, onFilter, total, looks, query, onQuery, wide }: MessageListProps): ReactNode {
  const { t } = useTranslation(['mail', 'common'])
  const [menu, setMenu] = useState<MenuRequest | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const unread = messages.filter((message) => message.unread).length
  const folderIcon = workspace?.folders.find((folder) => folder.name === place?.folder)?.icon
  const TitleGlyph = view !== null ? VIEW_GLYPHS[view] : (place?.folder ?? null) === null ? IconInbox : isWorkspaceGlyph(folderIcon) ? WORKSPACE_GLYPHS[folderIcon] : IconFolder
  const rows = useRef<HTMLUListElement | null>(null)

  /** Newest first, then scrolls to the first message from `day` or before it, and marks it briefly. */
  const jump = (day: Date): void => {
    const newestFirst = { key: 'received', descending: true } as const
    const ordered = sortMessages(messages, newestFirst)
    const before = endOfDay(day)
    const target = ordered.find((message) => Date.parse(message.receivedAt) < before) ?? ordered.at(-1)
    if (sort.key !== 'received' || !sort.descending) onSort(newestFirst)
    if (target === undefined) return
    // Two frames: one for the new order to render, one for layout, then the row is in place.
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        const row = rows.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(target.id)}"]`)
        row?.scrollIntoView({ block: 'start', behavior: 'smooth' })
        row?.querySelector('button')?.focus({ preventScroll: true })
        row?.animate([{ background: 'var(--brand-16)' }, { background: 'transparent' }], { duration: 1200, easing: 'ease-out' })
      }),
    )
  }

  const openMenu = (event: MouseEvent | KeyboardEvent, message: Message): void => {
    event.preventDefault()
    setMenu({ ...menuPoint(event), label: t('actions.menuLabel', { subject: message.subject }), items: actions.menu(message) })
  }
  return (
    <section className="message-list" data-wide={wide} aria-label={t('list.label')}>
      <header className="message-list__header">
        <div className="message-list__title">
          <TitleGlyph aria-hidden="true" className="message-list__glyph" />
          <h1>{view === null ? (place?.folder ?? t(INBOX_LABEL)) : t(`views.${view}`)}</h1>
          {view === null && workspace !== undefined && (
            <>
              <IconCaret aria-hidden="true" className="message-list__crumb" />
              <span className="message-list__workspace" aria-label={t('list.inWorkspace', { workspace: workspace.name })}>
                <WorkspaceIcon name={workspace.name} icon={workspace.icon} theme={theme} look={looks[workspace.id]} />
                <span>{workspace.name}</span>
              </span>
            </>
          )}
        </div>
        {view === 'trash' && messages.length > 0 ? (
          <button type="button" className="message-list__empty-trash" onClick={() => actions.emptyTrash(messages.length)}>
            {t('list.emptyTrash')}
          </button>
        ) : (
          <span className="message-list__tally">{unread > 0 ? t('list.unread', { count: unread }) : `${messages.length}`}</span>
        )}
        <label className="message-list__search">
          <IconSearch aria-hidden="true" />
          <span className="visually-hidden">{t('list.searchLabel')}</span>
          <input
            id="search"
            type="search"
            placeholder={t('list.searchPlaceholder')}
            value={query}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => onQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && query !== '') {
                event.preventDefault()
                event.stopPropagation()
                onQuery('')
              }
            }}
          />
        </label>
        <ListTools filter={filter} onFilter={onFilter} onJump={jump} compact={!wide} />
      </header>
      {messages.length === 0 && total > 0 && query.trim() !== '' ? (
        <div className="message-list__empty">
          <p>{t('list.searchMiss', { query: query.trim() })}</p>
          <button type="button" className="message-list__clear" onClick={() => onQuery('')}>
            {t('list.clearSearch')}
          </button>
        </div>
      ) : messages.length === 0 && total > 0 ? (
        <div className="message-list__empty">
          <p>{t('list.filter.empty', { filter: t(`list.filter.${filter}`).toLowerCase() })}</p>
          <button type="button" className="message-list__clear" onClick={() => onFilter('all')}>
            {t('list.filter.clear')}
          </button>
        </div>
      ) : messages.length === 0 ? (
        <p className="message-list__empty">
          {view === null ? <Trans t={t} i18nKey="list.empty" components={{ addresses: <code>{workspace?.addresses.join(', ') ?? t('list.thisWorkspace')}</code> }} /> : t(`list.emptyView.${view}`)}
        </p>
      ) : (
        <div className="message-list__body">
        <ListHeader sort={sort} onSort={onSort} />
        <ul ref={rows} className="message-list__rows">
          {messages.map((message) => (
            <li key={message.id} data-id={message.id}>
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
                  {formatListed(message.receivedAt)}
                </time>
                <span className="message-row__subject">
                  <span className="message-row__subject-text">{message.subject}</span>
                  <TagChips tags={message.tags} />
                  <span className="message-row__inline-preview">{message.preview}</span>
                </span>
                <span className="message-row__preview">{message.preview}</span>
              </button>
              <QuickActions message={message} actions={actions} />
            </li>
          ))}
        </ul>
        </div>
      )}
      {menu !== null && <ContextMenu request={menu} onClose={closeMenu} />}
    </section>
  )
}
