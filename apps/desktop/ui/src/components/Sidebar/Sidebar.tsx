import { useCallback, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { MailView, Place, Workspace } from '../../api/types'
import { BRAND_ICONS, isBrandIcon } from '../../constants/products'
import { INBOX_LABEL, UNSORTED_WORKSPACE } from '../../constants/ui'
import type { Theme } from '../../constants/ui'
import { useLeaving } from '../../hooks/useLeaving'
import { usePeek } from '../../hooks/usePeek'
import type { WorkspaceLooks } from '../../hooks/useWorkspaceLooks'
import {
  IconArchive,
  IconCaretDown,
  IconCompose,
  IconContacts,
  IconCopy,
  IconDelete,
  IconFolder,
  IconImage,
  IconInbox,
  IconMarkRead,
  IconRename,
  IconReset,
  IconSnooze,
  IconStar,
  IconUnsorted,
  isWorkspaceGlyph,
  WORKSPACE_GLYPHS,
} from '../../icons'
import { copyWithToast } from '../../lib/copy'
import { ContextMenu, isMenuKey, menuPoint } from '../ContextMenu/ContextMenu'
import type { MenuItem, MenuRequest } from '../ContextMenu/ContextMenu'
import { BuunFooter } from '../BuunFooter/BuunFooter'
import { DissolveOut } from '../Motion/DissolveOut'
import { TipButton } from '../Tooltip/TipButton'
import { WorkspaceIcon } from '../WorkspaceIcon/WorkspaceIcon'

import './Sidebar.css'

interface SidebarProps {
  workspaces: Workspace[]
  place: Place | null
  /** The open view across workspaces, if one is open instead of a folder. */
  view: MailView | null
  theme: Theme
  looks: WorkspaceLooks
  folded: Set<string>
  collapsed: boolean
  onOpen: (place: Place) => void
  onOpenView: (view: MailView) => void
  /** Opens a new message; null when nothing can send yet. */
  onCompose: () => void
  canCompose: boolean
  /** How many drafts are saved, shown beside Drafts. */
  draftCount: number
  onFold: (id: string) => void
  onEditIcon: (id: string) => void
  onResetIcon: (id: string) => void
  onMarkAllRead: (place: Place, wholeWorkspace: boolean) => void
}

/** The lists across every workspace, in sidebar order. */
const VIEWS = [
  { id: 'drafts', glyph: IconRename },
  { id: 'starred', glyph: IconStar },
  { id: 'snoozed', glyph: IconSnooze },
  { id: 'archive', glyph: IconArchive },
  { id: 'trash', glyph: IconDelete },
  { id: 'contacts', glyph: IconContacts },
] as const satisfies readonly { id: MailView; glyph: unknown }[]

/**
 * Every workspace and its folders, the open one marked. Collapsed, it is a rail of icons; pointing at it, scrolling
 * over it or tabbing into it slides it open over the list, and it folds back when the pointer and focus leave.
 */
export function Sidebar({ workspaces, place, view, theme, looks, folded, collapsed, onOpen, onOpenView, onCompose, canCompose, draftCount, onFold, onEditIcon, onResetIcon, onMarkAllRead }: SidebarProps): ReactNode {
  const { t } = useTranslation(['sidebar', 'common', 'mail'])
  // Why rename is off: names live in the routing file, which settings cannot edit yet.
  const needsEditor = t('menu.needsEditor')
  const nav = useRef<HTMLElement | null>(null)
  const [peek] = usePeek(nav, collapsed)
  // A folder that goes (an inbox that ended or was burned) dissolves away where it was.
  const allFolders = useMemo(() => workspaces.flatMap((workspace) => workspace.folders.map((folder) => ({ workspaceId: workspace.id, folder }))), [workspaces])
  const { list: keptFolders, gone: folderGone } = useLeaving(allFolders, (entry) => `${entry.workspaceId}\u0001${entry.folder.name ?? ''}`, 'sidebar')
  const rail = collapsed && !peek
  const [menu, setMenu] = useState<MenuRequest | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])

  const copyItem = (addresses: string[]): MenuItem => ({
    id: 'copy',
    label: t('menu.copyAddress', { count: addresses.length }),
    glyph: IconCopy,
    onSelect: () => void copyWithToast(addresses.join(', ')),
  })

  const workspaceMenu = (workspace: Workspace): MenuItem[] => {
    const isUnsorted = workspace.id === UNSORTED_WORKSPACE
    const items: MenuItem[] = [
      { id: 'open', label: t('menu.openInbox'), glyph: IconInbox, onSelect: () => onOpen({ workspace: workspace.id, folder: null }) },
      { id: 'fold', label: folded.has(workspace.id) ? t('menu.showFolders') : t('menu.hideFolders'), glyph: IconCaretDown, onSelect: () => onFold(workspace.id) },
      { id: 'read', label: t('menu.markAllRead'), glyph: IconMarkRead, onSelect: () => onMarkAllRead({ workspace: workspace.id, folder: null }, true), ...(workspace.unread === 0 ? { disabledReason: t('menu.nothingUnread') } : {}) },
    ]
    if (isUnsorted) return items
    return [
      ...items,
      { id: 'icon', label: t('menu.changeIcon'), glyph: IconImage, onSelect: () => onEditIcon(workspace.id), separated: true },
      ...(looks[workspace.id] === undefined ? [] : [{ id: 'reset', label: t('menu.useRoutingIcon'), glyph: IconReset, onSelect: () => onResetIcon(workspace.id) }]),
      { id: 'rename', label: t('menu.rename'), glyph: IconRename, disabledReason: needsEditor },
      { ...copyItem(workspace.addresses), separated: true },
    ]
  }

  const folderMenu = (workspace: Workspace, folder: string | null, unread: number): MenuItem[] => [
    { id: 'open', label: t('menu.open'), glyph: folder === null ? IconInbox : IconFolder, onSelect: () => onOpen({ workspace: workspace.id, folder }) },
    { id: 'read', label: t('menu.markAllRead'), glyph: IconMarkRead, onSelect: () => onMarkAllRead({ workspace: workspace.id, folder }, false), ...(unread === 0 ? { disabledReason: t('menu.nothingUnread') } : {}) },
    ...(folder === null ? [] : [{ id: 'rename', label: t('menu.rename'), glyph: IconRename, disabledReason: needsEditor }]),
    ...(workspace.addresses.length > 0 ? [{ ...copyItem(workspace.addresses), separated: true }] : []),
  ]

  const openMenu = (event: MouseEvent | KeyboardEvent, label: string, items: MenuItem[]): void => {
    event.preventDefault()
    setMenu({ ...menuPoint(event), label, items })
  }

  return (
    <div className="sidebar-slot">
      <nav ref={nav} className="sidebar" aria-label={t('nav.label')} data-collapsed={collapsed} data-rail={rail} data-peek={peek}>
        <header className="sidebar__top">
          <TipButton tip={canCompose ? (rail ? t('nav.compose') : null) : t('nav.composeNeedsSending')} side="right" className="sidebar__compose" aria-disabled={!canCompose || undefined} aria-label={t('nav.compose')} onClick={onCompose}>
            <IconCompose aria-hidden="true" />
            <span className="sidebar__text">{t('nav.compose')}</span>
          </TipButton>
        </header>

        <div className="sidebar__list">
          {workspaces.map((workspace) => (
            <section key={workspace.id} className="sidebar__workspace" aria-labelledby={`ws-${workspace.id}`}>
              <h2 id={`ws-${workspace.id}`} className="sidebar__heading">
                <TipButton
                  tip={rail ? workspace.name : null}
                  side="right"
                  className="sidebar__workspace-name"
                  aria-expanded={!folded.has(workspace.id)}
                  aria-label={rail ? workspace.name : undefined}
                  onClick={() => onFold(workspace.id)}
                  onContextMenu={(event) => openMenu(event, workspace.name, workspaceMenu(workspace))}
                  onKeyDown={(event) => {
                    if (isMenuKey(event)) openMenu(event, workspace.name, workspaceMenu(workspace))
                  }}
                >
                  {workspace.id === UNSORTED_WORKSPACE ? <IconUnsorted aria-hidden="true" className="sidebar__unsorted" /> : <WorkspaceIcon name={workspace.name} icon={workspace.icon} theme={theme} look={looks[workspace.id]} />}
                  <span className="sidebar__text sidebar__workspace-label">{workspace.name}</span>
                  <IconCaretDown aria-hidden="true" className="sidebar__fold sidebar__text" />
                </TipButton>
              </h2>
              <ul hidden={folded.has(workspace.id)}>
                {keptFolders.filter((kept) => kept.item.workspaceId === workspace.id).map(({ item: { folder }, key, leaving }) => {
                  const current = view === null && place?.workspace === workspace.id && place.folder === folder.name
                  const Glyph = folder.name === null ? IconInbox : isWorkspaceGlyph(folder.icon) ? WORKSPACE_GLYPHS[folder.icon] : IconFolder
                  const brand = folder.name !== null && isBrandIcon(folder.icon) ? BRAND_ICONS[folder.icon].mark[theme] : null
                  const label = folder.name ?? t(INBOX_LABEL)
                  const where = t('nav.folder', { workspace: workspace.name, folder: label })
                  return (
                    <DissolveOut as="li" key={key} out={leaving} onDone={() => folderGone(key)}>
                      <TipButton
                        tip={rail ? where : null}
                        side="right"
                        className="sidebar__folder"
                        data-unread={folder.unread > 0}
                        aria-current={current ? 'page' : undefined}
                        aria-label={rail ? (folder.unread > 0 ? t('nav.folderUnread', { workspace: workspace.name, folder: label, count: folder.unread }) : where) : undefined}
                        onClick={() => onOpen({ workspace: workspace.id, folder: folder.name })}
                        onContextMenu={(event) => openMenu(event, where, folderMenu(workspace, folder.name, folder.unread))}
                        onKeyDown={(event) => {
                          if (isMenuKey(event)) openMenu(event, where, folderMenu(workspace, folder.name, folder.unread))
                        }}
                      >
                        {brand === null ? <Glyph aria-hidden="true" /> : <img className="sidebar__folder-mark" src={brand} alt="" aria-hidden="true" />}
                        <span className="sidebar__folder-name sidebar__text">{label}</span>
                        {folder.unread > 0 && (
                          <span className="sidebar__count">
                            {folder.unread}
                            <span className="visually-hidden">{t('nav.unreadAfterCount', { count: folder.unread })}</span>
                          </span>
                        )}
                      </TipButton>
                    </DissolveOut>
                  )
                })}
              </ul>
            </section>
          ))}
          <section className="sidebar__workspace sidebar__views" aria-label={t('mail:views.label')}>
            <ul>
              {VIEWS.map((item) => {
                const label = t(`mail:views.${item.id}`)
                return (
                  <li key={item.id}>
                    <TipButton tip={rail ? label : null} side="right" className="sidebar__folder" aria-current={view === item.id ? 'page' : undefined} aria-label={rail ? label : undefined} onClick={() => onOpenView(item.id)}>
                      <item.glyph aria-hidden="true" />
                      <span className="sidebar__folder-name sidebar__text">{label}</span>
                      {item.id === 'drafts' && draftCount > 0 && <span className="sidebar__count">{draftCount}</span>}
                    </TipButton>
                  </li>
                )
              })}
            </ul>
          </section>
        </div>

        <BuunFooter theme={theme} />
      </nav>
      {menu !== null && <ContextMenu request={menu} onClose={closeMenu} />}
    </div>
  )
}
