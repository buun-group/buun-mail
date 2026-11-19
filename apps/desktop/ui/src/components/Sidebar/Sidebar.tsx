import type { ReactNode } from 'react'

import type { Place, Workspace } from '../../api/types'
import { INBOX_LABEL, UNSORTED_WORKSPACE } from '../../constants/ui'
import type { Theme } from '../../constants/ui'
import { IconFolder, IconInbox, IconMoon, IconSun, IconUnsorted } from '../../icons'
import { ProductSpot } from '../ProductSpot/ProductSpot'

import './Sidebar.css'

interface SidebarProps {
  workspaces: Workspace[]
  place: Place | null
  theme: Theme
  onOpen: (place: Place) => void
  onToggleTheme: () => void
}

/** Every workspace and its folders, the open one marked, with the Buun Group spot at the foot. */
export function Sidebar({ workspaces, place, theme, onOpen, onToggleTheme }: SidebarProps): ReactNode {
  return (
    <nav className="sidebar" aria-label="Workspaces">
      <header className="sidebar__brand">
        <span className="sidebar__logo" aria-hidden="true">
          @
        </span>
        <span className="sidebar__title">Buun Mail</span>
        <button type="button" className="sidebar__theme" onClick={onToggleTheme} aria-label={theme === 'dark' ? 'Use the light theme' : 'Use the dark theme'}>
          {theme === 'dark' ? <IconSun aria-hidden="true" /> : <IconMoon aria-hidden="true" />}
        </button>
      </header>

      <div className="sidebar__list">
        {workspaces.map((workspace) => (
          <section key={workspace.id} className="sidebar__workspace" aria-label={workspace.name}>
            <p className="sidebar__workspace-name">
              {workspace.name}
              <span className="sidebar__addresses">{workspace.addresses.join('  ')}</span>
            </p>
            <ul>
              {workspace.folders.map((folder) => {
                const open = place?.workspace === workspace.id && place.folder === folder.name
                const Glyph = folder.name !== null ? IconFolder : workspace.id === UNSORTED_WORKSPACE ? IconUnsorted : IconInbox
                return (
                  <li key={folder.name ?? INBOX_LABEL}>
                    <button type="button" className={open ? 'sidebar__folder sidebar__folder--open' : 'sidebar__folder'} aria-current={open ? 'page' : undefined} onClick={() => onOpen({ workspace: workspace.id, folder: folder.name })}>
                      <Glyph aria-hidden="true" />
                      <span className="sidebar__folder-name">{folder.name ?? INBOX_LABEL}</span>
                      {folder.unread > 0 && (
                        <span className="sidebar__unread">
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

      <ProductSpot theme={theme} />
    </nav>
  )
}
