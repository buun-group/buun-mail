import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import type { MailView, Message, Place, Workspace } from '../../api/types'
import { INBOX_LABEL } from '../../constants/ui'
import type { ListFilter, ListSort, Theme } from '../../constants/ui'
import type { WorkspaceLooks } from '../../hooks/useWorkspaceLooks'
import { endOfDay, sortMessages } from '../../lib/sort'
import { WorkspaceIcon } from '../WorkspaceIcon/WorkspaceIcon'
import { ListTools } from './ListTools'
import { IconArchive, IconCaret, IconContacts, IconConversation, IconDelete, IconRename, IconSnooze, IconFolder, IconInbox, IconSearch, IconStar, IconStarred, IconUnread, isWorkspaceGlyph, WORKSPACE_GLYPHS } from '../../icons'
import { Avatar } from '../Avatar/Avatar'
import { formatListed } from '../../lib/time'
import { ContextMenu, isMenuKey, menuPoint } from '../ContextMenu/ContextMenu'
import type { MenuRequest } from '../ContextMenu/ContextMenu'
import type { MessageActions } from '../../hooks/useMessageActions'
import { ListHeader } from './ListHeader'
import { SelectionBar } from './SelectionBar'
import { QuickActions } from './QuickActions'
import { useLeaving } from '../../hooks/useLeaving'
import { DissolveOut } from '../Motion/DissolveOut'
import { RowDetails, rowDetailsLabel } from './RowDetails'
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
  /** Whether the search box looks in this list or every folder's full text. */
  scope: 'list' | 'all'
  onScope: (scope: 'list' | 'all') => void
  /** The list fills the window (reading pane off): each message on one line. */
  wide: boolean
  /** A bar under the header for the open workspace, such as dissolve.email's inbox actions. */
  banner?: ReactNode
  /** Shown instead of the empty-folder words, such as dissolve.email's list of inboxes on its workspace page. */
  emptyState?: ReactNode
  /** Show each message's sender checks and size (Settings, General). */
  details?: boolean
}

const VIEW_GLYPHS = { starred: IconStar, snoozed: IconSnooze, archive: IconArchive, trash: IconDelete, drafts: IconRename, contacts: IconContacts } as const satisfies Record<MailView, unknown>

/**
 * The open folder's messages, or a view across workspaces, newest first, as flat rows split by hairlines. Unread is
 * heavier type and an envelope glyph. Right click, the menu key or Shift F10 on a row opens what can be done to it.
 */
export function MessageList({ workspace, place, view, messages, selectedId, onSelect, actions, workspaceName, theme, sort, onSort, filter, onFilter, total, looks, query, onQuery, scope, onScope, wide, banner, details = false, emptyState }: MessageListProps): ReactNode {
  const { t } = useTranslation(['mail', 'common'])
  const [menu, setMenu] = useState<MenuRequest | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const unread = messages.filter((message) => message.unread).length
  // A message that leaves the list while it is open (deleted, archived, moved, or gone with its inbox) dissolves away.
  const { list: keptMessages, gone: messageGone } = useLeaving(messages, (message) => message.id, `${place?.workspace ?? ''}|${place?.folder ?? ''}|${view ?? ''}|${query}|${scope}|${filter}`)
  const folderIcon = workspace?.folders.find((folder) => folder.name === place?.folder)?.icon
  const TitleGlyph = view !== null ? VIEW_GLYPHS[view] : (place?.folder ?? null) === null ? IconInbox : isWorkspaceGlyph(folderIcon) ? WORKSPACE_GLYPHS[folderIcon] : IconFolder
  const rows = useRef<HTMLUListElement | null>(null)

  // Selected messages for bulk actions, cleared when another folder, view or search opens.
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<string | null>(null)
  const listKey = `${place?.workspace ?? ''}/${place?.folder ?? ''}/${view ?? ''}/${scope}`
  const [pickedFor, setPickedFor] = useState(listKey)
  if (pickedFor !== listKey) {
    setPickedFor(listKey)
    setPicked(new Set())
    setAnchor(null)
  }
  const selected = messages.filter((message) => picked.has(message.id))

  const clearPicked = useCallback(() => setPicked(new Set()), [])
  /** Toggles one message, or with Shift every message between it and the last one toggled. */
  const pick = (message: Message, range: boolean): void => {
    setPicked((current) => {
      const next = new Set(current)
      const from = anchor === null ? -1 : messages.findIndex((item) => item.id === anchor)
      const to = messages.findIndex((item) => item.id === message.id)
      if (range && from !== -1 && to !== -1) {
        const [low, high] = from < to ? [from, to] : [to, from]
        messages.slice(low, high + 1).forEach((item) => next.add(item.id))
      } else if (next.has(message.id)) next.delete(message.id)
      else next.add(message.id)
      return next
    })
    setAnchor(message.id)
  }

  // Ctrl or Cmd A selects the whole list, X toggles the focused row, Escape clears; read fresh when a key lands.
  const onRowsKey = useRef<(event: globalThis.KeyboardEvent) => void>(() => {})
  useLayoutEffect(() => {
    onRowsKey.current = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
        event.preventDefault()
        setPicked(new Set(messages.map((message) => message.id)))
      } else if (event.key === 'Escape' && picked.size > 0) {
        event.stopPropagation()
        setPicked(new Set())
      } else if (event.key === 'x') {
        const focused = messages.find((message) => document.activeElement?.closest(`[data-id="${CSS.escape(message.id)}"]`) != null)
        if (focused !== undefined) pick(focused, false)
      }
    }
  })
  const attachRows = useCallback((element: HTMLUListElement | null) => {
    rows.current = element
    if (element === null) return undefined
    const listener = (event: globalThis.KeyboardEvent): void => onRowsKey.current(event)
    element.addEventListener('keydown', listener)
    return () => element.removeEventListener('keydown', listener)
  }, [])

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
    <section className="message-list" data-wide={wide} data-banner={banner !== undefined} data-details={details} aria-label={t('list.label')}>
      <header className="message-list__header" data-selecting={selected.length > 0}>
        {selected.length > 0 && <SelectionBar selected={selected} total={messages.length} workspace={workspace} bulk={actions.bulk} onSnooze={actions.snooze} onSelectAll={() => setPicked(new Set(messages.map((message) => message.id)))} onClear={clearPicked} />}
        <div className="message-list__title">
          <TitleGlyph aria-hidden="true" className="message-list__glyph" />
          <h1>{scope === 'all' && query.trim() !== '' ? t('list.searchResults') : view === null ? (place?.folder ?? t(INBOX_LABEL)) : t(`views.${view}`)}</h1>
          {view === null && workspace !== undefined && !(scope === 'all' && query.trim() !== '') && (
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
        {query.trim() !== '' && (
          <div className="search-scope" role="radiogroup" aria-label={t('list.scope.label')}>
            {(['list', 'all'] as const).map((choice) => (
              <button key={choice} type="button" role="radio" aria-checked={scope === choice} className="search-scope__choice" onClick={() => onScope(choice)}>
                {t(`list.scope.${choice}`)}
              </button>
            ))}
          </div>
        )}
      </header>
      {banner}
      {keptMessages.length === 0 && total > 0 && query.trim() !== '' ? (
        <div className="message-list__empty">
          <p>{t('list.searchMiss', { query: query.trim() })}</p>
          <button type="button" className="message-list__clear" onClick={() => onQuery('')}>
            {t('list.clearSearch')}
          </button>
        </div>
      ) : keptMessages.length === 0 && total > 0 ? (
        <div className="message-list__empty">
          <p>{t('list.filter.empty', { filter: t(`list.filter.${filter}`).toLowerCase() })}</p>
          <button type="button" className="message-list__clear" onClick={() => onFilter('all')}>
            {t('list.filter.clear')}
          </button>
        </div>
      ) : keptMessages.length === 0 && emptyState !== undefined ? (
        emptyState
      ) : keptMessages.length === 0 ? (
        <p className="message-list__empty">
          {view === null ? <Trans t={t} i18nKey="list.empty" components={{ addresses: <code>{workspace?.addresses.join(', ') ?? t('list.thisWorkspace')}</code> }} /> : t(`list.emptyView.${view}`)}
        </p>
      ) : (
        <div className="message-list__body">
        <ListHeader sort={sort} onSort={onSort} details={details} />
        <ul ref={attachRows} className="message-list__rows" data-selecting={selected.length > 0}>
          {keptMessages.map(({ item: message, leaving }) => (
            <DissolveOut as="li" key={message.id} out={leaving} onDone={() => messageGone(message.id)} data-id={leaving ? undefined : message.id} data-picked={picked.has(message.id)}>
              <input
                type="checkbox"
                className="row-check row-check--row"
                checked={picked.has(message.id)}
                aria-label={t('selection.select', { subject: message.subject })}
                onClick={(event) => {
                  event.stopPropagation()
                  pick(message, event.shiftKey)
                }}
                onChange={() => undefined}
              />
              <button
                type="button"
                className="message-row"
                data-unread={message.unread}
                aria-current={message.id === selectedId ? 'true' : undefined}
                onClick={(event) => {
                  if (event.shiftKey || event.ctrlKey || event.metaKey) pick(message, event.shiftKey)
                  else onSelect(message)
                }}
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
                  {message.threadSize > 1 && (
                    <span className="message-row__thread" aria-label={t('list.conversation', { count: message.threadSize })}>
                      <IconConversation aria-hidden="true" />
                      {message.threadSize}
                    </span>
                  )}
                  {(view !== null || (scope === 'all' && query.trim() !== '')) && <span className="message-row__where">{workspaceName(message.workspace)}</span>}
                </span>
                <time className="message-row__time" dateTime={message.receivedAt}>
                  {message.snoozedUntil !== null ? t('snooze.until', { when: formatListed(message.snoozedUntil) }) : formatListed(message.receivedAt)}
                </time>
                <span className="message-row__subject">
                  <span className="message-row__subject-text">{message.subject}</span>
                  <TagChips tags={message.tags} />
                  <span className="message-row__inline-preview">{message.preview}</span>
                </span>
                <span className="message-row__preview">{message.preview}</span>
                {details && (
                  <>
                    <RowDetails message={message} />
                    <span className="visually-hidden">{rowDetailsLabel(message)}</span>
                  </>
                )}
              </button>
              <QuickActions message={message} actions={actions} />
            </DissolveOut>
          ))}
        </ul>
        </div>
      )}
      {menu !== null && <ContextMenu request={menu} onClose={closeMenu} />}
    </section>
  )
}
