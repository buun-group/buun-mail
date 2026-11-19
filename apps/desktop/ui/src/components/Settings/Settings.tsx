import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

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

/** Each section's name, as keys for `t()`. */
const SECTION_LABELS = {
  general: 'sections.general',
  notifications: 'sections.notifications',
  workspaces: 'sections.workspaces',
  rules: 'sections.rules',
  integrations: 'sections.integrations',
  agents: 'sections.agents',
} as const satisfies Record<SettingsSection, string>

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
  /** Called when a sender is connected, changed or removed, so what can send is read again. */
  onSendersChanged: () => void
}

/** Settings in a native modal dialog: sections down the left, the chosen one on the right. Escape closes it. */
export function Settings({ open, onClose, preferences, workspaces, looks, onLook, section, onSection, editing, onEditing, onImported, notifications, onSendersChanged }: SettingsProps): ReactNode {
  const { t } = useTranslation('settings')
  const dialog = useRef<HTMLDialogElement | null>(null)

  useEffect(() => {
    const element = dialog.current
    if (element === null) return
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  return (
    <dialog ref={dialog} className="settings" aria-labelledby="settings-title" onClose={onClose}>
      <nav className="settings__nav" aria-label={t('sectionsLabel')}>
        <h2 id="settings-title">{t('title')}</h2>
        {SETTINGS_SECTIONS.map((id) => {
          const Glyph = SECTION_GLYPHS[id]
          return (
            <button key={id} type="button" className="settings__tab" aria-current={id === section ? 'page' : undefined} onClick={() => onSection(id)}>
              <Glyph aria-hidden="true" />
              {t(SECTION_LABELS[id])}
            </button>
          )
        })}
      </nav>
      <div className="settings__panel">
        <header className="settings__head">
          <h3>{t(SECTION_LABELS[section])}</h3>
          <button type="button" className="settings__close" onClick={onClose} aria-label={t('close')}>
            <IconClose aria-hidden="true" />
          </button>
        </header>
        <div className="settings__body">
          {section === 'general' && <GeneralSection preferences={preferences} />}
          {section === 'notifications' && <NotificationsSection notifications={notifications} workspaces={workspaces} />}
          {section === 'workspaces' && <WorkspacesSection workspaces={workspaces} looks={looks} onLook={onLook} editing={editing} onEditing={onEditing} theme={preferences.theme} />}
          {section === 'rules' && <RulesSection workspaces={workspaces} onChanged={onImported} />}
          {section === 'integrations' && <IntegrationsSection onImported={onImported} onSendersChanged={onSendersChanged} theme={preferences.theme} />}
          {section === 'agents' && <AgentsSection />}
        </div>
      </div>
    </dialog>
  )
}
