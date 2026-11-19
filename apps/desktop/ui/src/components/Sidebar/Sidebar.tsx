import type { ReactNode } from 'react'

import type { Place, Workspace } from '../../api/types'
import { INBOX_LABEL, UNSORTED_WORKSPACE } from '../../constants/ui'
import type { Theme } from '../../constants/ui'
import { IconCompose, IconFolder, IconInbox, IconSettings, IconUnsorted } from '../../icons'
import { Avatar } from '../Avatar/Avatar'
import { BrandMark } from '../BrandMark/BrandMark'
import { BuunFooter } from '../BuunFooter/BuunFooter'

import './Sidebar.css'

interface SidebarProps {
  workspaces: Workspace[]
  place: Place | null
  theme: Theme
  onOpen: (place: Place) => void
  onSettings: () => void
}

/** Every workspace and its folders, the open one marked. Compose and settings at the top, Buun Group at the foot. */
export function Sidebar({ workspaces, place, theme, onOpen, onSettings }: SidebarProps): ReactNode {
  return (
    <nav className="sidebar" aria-label="Workspaces">
      <header className="sidebar__top">
        <span className="sidebar__brand">
          <BrandMark size={22} />
          Buun Mail
        </span>
        <button type="button" className="sidebar__icon" onClick={onSettings} aria-label="Settings">
          <IconSettings aria-hidden="true" />
        </button>
        <button type="button" className="sidebar__compose" disabled>
          <IconCompose aria-hidden="true" />
          Compose
        </button>
      </header>

      <div className="sidebar__list">
        {workspaces.map((workspace) => (
          <section key={workspace.id} className="sidebar__workspace" aria-labelledby={`ws-${workspace.id}`}>
            <h2 id={`ws-${workspace.id}`} className="sidebar__workspace-name">
              {workspace.id === UNSORTED_WORKSPACE ? <IconUnsorted aria-hidden="true" className="sidebar__unsorted" /> : <Avatar name={workspace.name} />}
              {workspace.name}
            </h2>
            <ul>
              {workspace.folders.map((folder) => {
                const open = place?.workspace === workspace.id && place.folder === folder.name
                const Glyph = folder.name === null ? IconInbox : IconFolder
                return (
                  <li key={folder.name ?? INBOX_LABEL}>
                    <button type="button" className="sidebar__folder" aria-current={open ? 'page' : undefined} onClick={() => onOpen({ workspace: workspace.id, folder: folder.name })}>
                      <Glyph aria-hidden="true" />
                      <span className="sidebar__folder-name">{folder.name ?? INBOX_LABEL}</span>
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
  )
}
