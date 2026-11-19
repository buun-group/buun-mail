import { useCallback, useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { Place, Workspace } from '../../api/types'
import { BRAND_ICONS, isBrandIcon } from '../../constants/products'
import { INBOX_LABEL, UNSORTED_WORKSPACE } from '../../constants/ui'
import type { Theme } from '../../constants/ui'
import { usePeek } from '../../hooks/usePeek'
import type { WorkspaceLooks } from '../../hooks/useWorkspaceLooks'
import {
  IconCaretDown,
  IconCompose,
  IconCopy,
  IconFolder,
  IconImage,
  IconInbox,
  IconMarkRead,
  IconRename,
  IconReset,
  IconUnsorted,
  isWorkspaceGlyph,
  WORKSPACE_GLYPHS,
} from '../../icons'
import { copyText } from '../../lib/clipboard'
import { ContextMenu } from '../ContextMenu/ContextMenu'
import type { MenuItem, MenuRequest } from '../ContextMenu/ContextMenu'
import { BuunFooter } from '../BuunFooter/BuunFooter'
import { TipButton } from '../Tooltip/TipButton'
import { WorkspaceIcon } from '../WorkspaceIcon/WorkspaceIcon'

import './Sidebar.css'

interface SidebarProps {
  workspaces: Workspace[]
  place: Place | null
  theme: Theme
  looks: WorkspaceLooks
  folded: Set<string>
  collapsed: boolean
  onOpen: (place: Place) => void
  onFold: (id: string) => void
  onEditIcon: (id: string) => void
  onResetIcon: (id: string) => void
  onMarkAllRead: (place: Place, wholeWorkspace: boolean) => void
}

/** True for the keys that open a context menu from the keyboard: the menu key, or Shift and F10. */
function isMenuKey(event: KeyboardEvent): boolean {
  return event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')
}

/** Where to open a menu: at the pointer for a right click, under the row for the keyboard. */
function menuPoint(event: MouseEvent | KeyboardEvent): { x: number; y: number } {
  if ('clientX' in event && event.clientX !== 0) return { x: event.clientX, y: event.clientY }
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  return { x: box.left + 24, y: box.bottom }
}

/**
 * Every workspace and its folders, the open one marked. Collapsed, it is a rail of icons; pointing at it, scrolling
 * over it or tabbing into it slides it open over the list, and it folds back when the pointer and focus leave.
 */
export function Sidebar({ workspaces, place, theme, looks, folded, collapsed, onOpen, onFold, onEditIcon, onResetIcon, onMarkAllRead }: SidebarProps): ReactNode {
  const { t } = useTranslation(['sidebar', 'common'])
  // Why rename is off: names live in the routing file, which settings cannot edit yet.
  const needsEditor = t('menu.needsEditor')
  const nav = useRef<HTMLElement | null>(null)
  const [peek] = usePeek(nav, collapsed)
  const rail = collapsed && !peek
  const [menu, setMenu] = useState<MenuRequest | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])

  const copyItem = (addresses: string[]): MenuItem => ({
    id: 'copy',
    label: t('menu.copyAddress', { count: addresses.length }),
    glyph: IconCopy,
    onSelect: () => void copyText(addresses.join(', ')),
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
          <button type="button" className="sidebar__compose" disabled aria-label={t('nav.compose')}>
            <IconCompose aria-hidden="true" />
            <span className="sidebar__text">{t('nav.compose')}</span>
          </button>
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
                {workspace.folders.map((folder) => {
                  const current = place?.workspace === workspace.id && place.folder === folder.name
                  const Glyph = folder.name === null ? IconInbox : isWorkspaceGlyph(folder.icon) ? WORKSPACE_GLYPHS[folder.icon] : IconFolder
                  const brand = folder.name !== null && isBrandIcon(folder.icon) ? BRAND_ICONS[folder.icon].mark[theme] : null
                  const label = folder.name ?? t(INBOX_LABEL)
                  const where = t('nav.folder', { workspace: workspace.name, folder: label })
                  return (
                    <li key={label}>
                      <TipButton
                        tip={rail ? where : null}
                        side="right"
                        className="sidebar__folder"
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
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>

        <BuunFooter theme={theme} />
      </nav>
      {menu !== null && <ContextMenu request={menu} onClose={closeMenu} />}
    </div>
  )
}
