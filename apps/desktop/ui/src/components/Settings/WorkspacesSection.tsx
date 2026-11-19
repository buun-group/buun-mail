import type { ReactNode } from 'react'

import type { Workspace } from '../../api/types'
import { UNSORTED_WORKSPACE } from '../../constants/ui'
import { Avatar } from '../Avatar/Avatar'

/** Every workspace as the routing file defines it: the addresses it owns and its folders. Read-only for now. */
export function WorkspacesSection({ workspaces }: { workspaces: Workspace[] }): ReactNode {
  const defined = workspaces.filter((workspace) => workspace.id !== UNSORTED_WORKSPACE)
  return (
    <>
      <p className="settings__intro">
        Workspaces come from your routing file, <code>workspaces.toml</code>. An exact address beats its domain, and mail no workspace claims waits in Unsorted. Editing them here arrives with the local store.
      </p>
      <ul className="settings__list">
        {defined.map((workspace) => (
          <li key={workspace.id} className="settings__workspace">
            <Avatar name={workspace.name} />
            <div>
              <p className="settings__label">{workspace.name}</p>
              <p className="settings__mono">{workspace.addresses.join('  ')}</p>
            </div>
            <span className="settings__hint">
              {workspace.folders.length - 1 === 0 ? 'Inbox only' : `${workspace.folders.length - 1} ${workspace.folders.length === 2 ? 'folder' : 'folders'}`}
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}
