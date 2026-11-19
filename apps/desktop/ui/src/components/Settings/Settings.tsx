import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

import type { Workspace } from '../../api/types'
import { SETTINGS_SECTIONS } from '../../constants/ui'
import type { SettingsSection } from '../../constants/ui'
import type { Notifications } from '../../hooks/useNotifications'
import type { Preferences } from '../../hooks/usePreferences'
import type { WorkspaceLook, WorkspaceLooks } from '../../hooks/useWorkspaceLooks'
import { IconClose, SECTION_GLYPHS } from '../../icons'
import { AgentsSection } from './AgentsSection'
import { GeneralSection } from './GeneralSection'
import { IntegrationsSection } from './IntegrationsSection'
import { NotificationsSection } from './NotificationsSection'
import { RulesSection } from './RulesSection'
import { WorkspacesSection } from './WorkspacesSection'

import './Settings.css'

const SECTION_LABELS: Record<SettingsSection, string> = {
  general: 'General',
  notifications: 'Notifications',
  workspaces: 'Workspaces',
  rules: 'Rules',
  integrations: 'Integrations',
  agents: 'Agents',
}

interface SettingsProps {
  open: boolean
  onClose: () => void
  preferences: Preferences
  workspaces: Workspace[]
  looks: WorkspaceLooks
  onLook: (id: string, look: WorkspaceLook | null) => void
  section: SettingsSection
  onSection: (section: SettingsSection) => void
  /** The workspace whose icon picker is open, if any. */
  editing: string | null
  onEditing: (id: string | null) => void
  /** Called after an import adds mail, so the mailbox reloads. */
  onImported: () => void
  notifications: Notifications
}

/** Settings in a native modal dialog: sections down the left, the chosen one on the right. Escape closes it. */
export function Settings({ open, onClose, preferences, workspaces, looks, onLook, section, onSection, editing, onEditing, onImported, notifications }: SettingsProps): ReactNode {
  const dialog = useRef<HTMLDialogElement | null>(null)

  useEffect(() => {
    const element = dialog.current
    if (element === null) return
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  return (
    <dialog ref={dialog} className="settings" aria-labelledby="settings-title" onClose={onClose}>
      <nav className="settings__nav" aria-label="Settings sections">
        <h2 id="settings-title">Settings</h2>
        {SETTINGS_SECTIONS.map((id) => {
          const Glyph = SECTION_GLYPHS[id]
          return (
            <button key={id} type="button" className="settings__tab" aria-current={id === section ? 'page' : undefined} onClick={() => onSection(id)}>
              <Glyph aria-hidden="true" />
              {SECTION_LABELS[id]}
            </button>
          )
        })}
      </nav>
      <div className="settings__panel">
        <header className="settings__head">
          <h3>{SECTION_LABELS[section]}</h3>
          <button type="button" className="settings__close" onClick={onClose} aria-label="Close settings">
            <IconClose aria-hidden="true" />
          </button>
        </header>
        <div className="settings__body">
          {section === 'general' && <GeneralSection preferences={preferences} />}
          {section === 'notifications' && <NotificationsSection notifications={notifications} workspaces={workspaces} />}
          {section === 'workspaces' && <WorkspacesSection workspaces={workspaces} looks={looks} onLook={onLook} editing={editing} onEditing={onEditing} theme={preferences.theme} />}
          {section === 'rules' && <RulesSection workspaces={workspaces} onChanged={onImported} />}
          {section === 'integrations' && <IntegrationsSection onImported={onImported} />}
          {section === 'agents' && <AgentsSection />}
        </div>
      </div>
    </dialog>
  )
}
