import { Mark } from '@buun-mail/brand/react'
import { useCallback, useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'

import type { Place, Workspace } from '../../api/types'
import { BRAND_ICONS, isBrandIcon } from '../../constants/products'
import { INBOX_LABEL, THEME_PREFERENCES, UNSORTED_WORKSPACE } from '../../constants/ui'
import type { Theme, ThemePreference } from '../../constants/ui'
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
  IconSettings,
  IconSidebar,
  IconUnsorted,
  isWorkspaceGlyph,
  THEME_GLYPHS,
  WORKSPACE_GLYPHS,
} from '../../icons'
import { copyText } from '../../lib/clipboard'
import { ContextMenu } from '../ContextMenu/ContextMenu'
import type { MenuItem, MenuRequest } from '../ContextMenu/ContextMenu'
import { BuunFooter } from '../BuunFooter/BuunFooter'
import { WorkspaceIcon } from '../WorkspaceIcon/WorkspaceIcon'

import './Sidebar.css'

interface SidebarProps {
  workspaces: Workspace[]
  place: Place | null
  theme: Theme
  themePreference: ThemePreference
  onThemePreference: (value: ThemePreference) => void
  looks: WorkspaceLooks
  folded: Set<string>
  collapsed: boolean
  onCollapse: (collapsed: boolean) => void
  onOpen: (place: Place) => void
  onSettings: () => void
  onFold: (id: string) => void
  onEditIcon: (id: string) => void
  onResetIcon: (id: string) => void
}

const THEME_NAMES: Record<ThemePreference, string> = { system: 'Match system', light: 'Light', dark: 'Dark' }

/** The theme after this one: Match system, Light, Dark, then round again. */
function nextTheme(current: ThemePreference): ThemePreference {
  return THEME_PREFERENCES[(THEME_PREFERENCES.indexOf(current) + 1) % THEME_PREFERENCES.length] ?? 'system'
}

/** Why the items that need the local store are off. */
const NEEDS_STORE = 'Arrives with the local store'

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
export function Sidebar({ workspaces, place, theme, themePreference, onThemePreference, looks, folded, collapsed, onCollapse, onOpen, onSettings, onFold, onEditIcon, onResetIcon }: SidebarProps): ReactNode {
  const nav = useRef<HTMLElement | null>(null)
  const [peek, setPeek] = usePeek(nav, collapsed)
  const rail = collapsed && !peek
  const [menu, setMenu] = useState<MenuRequest | null>(null)
  const ThemeGlyph = THEME_GLYPHS[themePreference]
  const upcoming = nextTheme(themePreference)
  const closeMenu = useCallback(() => setMenu(null), [])

  const copyItem = (addresses: string[]): MenuItem => ({
    id: 'copy',
    label: addresses.length > 1 ? 'Copy addresses' : 'Copy address',
    glyph: IconCopy,
    onSelect: () => void copyText(addresses.join(', ')),
  })

  const workspaceMenu = (workspace: Workspace): MenuItem[] => {
    const isUnsorted = workspace.id === UNSORTED_WORKSPACE
    const items: MenuItem[] = [
      { id: 'open', label: 'Open inbox', glyph: IconInbox, onSelect: () => onOpen({ workspace: workspace.id, folder: null }) },
      { id: 'fold', label: folded.has(workspace.id) ? 'Show folders' : 'Hide folders', glyph: IconCaretDown, onSelect: () => onFold(workspace.id) },
      { id: 'read', label: 'Mark all as read', glyph: IconMarkRead, disabledReason: NEEDS_STORE },
    ]
    if (isUnsorted) return items
    return [
      ...items,
      { id: 'icon', label: 'Change icon', glyph: IconImage, onSelect: () => onEditIcon(workspace.id), separated: true },
      ...(looks[workspace.id] === undefined ? [] : [{ id: 'reset', label: 'Use the routing file icon', glyph: IconReset, onSelect: () => onResetIcon(workspace.id) }]),
      { id: 'rename', label: 'Rename', glyph: IconRename, disabledReason: NEEDS_STORE },
      { ...copyItem(workspace.addresses), separated: true },
    ]
  }

  const folderMenu = (workspace: Workspace, folder: string | null): MenuItem[] => [
    { id: 'open', label: 'Open', glyph: folder === null ? IconInbox : IconFolder, onSelect: () => onOpen({ workspace: workspace.id, folder }) },
    { id: 'read', label: 'Mark all as read', glyph: IconMarkRead, disabledReason: NEEDS_STORE },
    ...(folder === null ? [] : [{ id: 'rename', label: 'Rename', glyph: IconRename, disabledReason: NEEDS_STORE }]),
    ...(workspace.addresses.length > 0 ? [{ ...copyItem(workspace.addresses), separated: true }] : []),
  ]

  const openMenu = (event: MouseEvent | KeyboardEvent, label: string, items: MenuItem[]): void => {
    event.preventDefault()
    setMenu({ ...menuPoint(event), label, items })
  }

  return (
    <div className="sidebar-slot">
      <nav ref={nav} className="sidebar" aria-label="Workspaces" data-collapsed={collapsed} data-rail={rail} data-peek={peek}>
        <header className="sidebar__top" data-tauri-drag-region>
          <span className="sidebar__brand" data-tauri-drag-region>
            <Mark size={22} />
            <span className="sidebar__text">Buun Mail</span>
          </span>
          <span className="sidebar__tools">
            <button
              type="button"
              className="sidebar__icon sidebar__tool"
              onClick={() => onThemePreference(upcoming)}
              aria-label={`Theme: ${THEME_NAMES[themePreference]}. Switch to ${THEME_NAMES[upcoming]}`}
              data-tip={THEME_NAMES[themePreference]}
            >
              <ThemeGlyph aria-hidden="true" />
            </button>
            <button type="button" className="sidebar__icon sidebar__tool" onClick={onSettings} aria-label="Settings" data-tip="Settings">
              <IconSettings aria-hidden="true" />
            </button>
            <button
              type="button"
              className="sidebar__icon"
              data-tip={collapsed ? 'Keep open' : 'Collapse'}
              aria-pressed={collapsed}
              aria-label={collapsed ? 'Keep the sidebar open' : 'Collapse the sidebar'}
              onClick={() => {
                onCollapse(!collapsed)
                setPeek(false)
              }}
            >
              <IconSidebar aria-hidden="true" />
            </button>
          </span>
          <button type="button" className="sidebar__compose" disabled aria-label="Compose">
            <IconCompose aria-hidden="true" />
            <span className="sidebar__text">Compose</span>
          </button>
        </header>

        <div className="sidebar__list">
          {workspaces.map((workspace) => (
            <section key={workspace.id} className="sidebar__workspace" aria-labelledby={`ws-${workspace.id}`}>
              <h2 id={`ws-${workspace.id}`} className="sidebar__heading">
                <button
                  type="button"
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
                </button>
              </h2>
              <ul hidden={folded.has(workspace.id)}>
                {workspace.folders.map((folder) => {
                  const current = place?.workspace === workspace.id && place.folder === folder.name
                  const Glyph = folder.name === null ? IconInbox : isWorkspaceGlyph(folder.icon) ? WORKSPACE_GLYPHS[folder.icon] : IconFolder
                  const brand = folder.name !== null && isBrandIcon(folder.icon) ? BRAND_ICONS[folder.icon].mark[theme] : null
                  const label = folder.name ?? INBOX_LABEL
                  return (
                    <li key={label}>
                      <button
                        type="button"
                        className="sidebar__folder"
                        aria-current={current ? 'page' : undefined}
                        aria-label={rail ? `${workspace.name}, ${label}${folder.unread > 0 ? `, ${folder.unread} unread` : ''}` : undefined}
                        onClick={() => onOpen({ workspace: workspace.id, folder: folder.name })}
                        onContextMenu={(event) => openMenu(event, `${workspace.name}, ${label}`, folderMenu(workspace, folder.name))}
                        onKeyDown={(event) => {
                          if (isMenuKey(event)) openMenu(event, `${workspace.name}, ${label}`, folderMenu(workspace, folder.name))
                        }}
                      >
                        {brand === null ? <Glyph aria-hidden="true" /> : <img className="sidebar__folder-mark" src={brand} alt="" aria-hidden="true" />}
                        <span className="sidebar__folder-name sidebar__text">{label}</span>
                        {folder.unread > 0 && (
                          <span className="sidebar__count">
                            {folder.unread}
                            <span className="visually-hidden"> unread</span>
                          </span>
                        )}
                      </button>
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
