import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import type { Workspace } from '../../api/types'
import { SETTINGS_SECTIONS } from '../../constants/ui'
import type { SettingsSection } from '../../constants/ui'
import type { Preferences } from '../../hooks/usePreferences'
import { IconClose, SECTION_GLYPHS } from '../../icons'
import { GeneralSection } from './GeneralSection'
import { IntegrationsSection } from './IntegrationsSection'
import { WorkspacesSection } from './WorkspacesSection'

import './Settings.css'

const SECTION_LABELS: Record<SettingsSection, string> = {
  general: 'General',
  workspaces: 'Workspaces',
  integrations: 'Integrations',
}

interface SettingsProps {
  open: boolean
  onClose: () => void
  preferences: Preferences
  workspaces: Workspace[]
}

/** Settings in a native modal dialog: sections down the left, the chosen one on the right. Escape closes it. */
export function Settings({ open, onClose, preferences, workspaces }: SettingsProps): ReactNode {
  const dialog = useRef<HTMLDialogElement | null>(null)
  const [section, setSection] = useState<SettingsSection>('general')

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
            <button key={id} type="button" className="settings__tab" aria-current={id === section ? 'page' : undefined} onClick={() => setSection(id)}>
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
          {section === 'workspaces' && <WorkspacesSection workspaces={workspaces} />}
          {section === 'integrations' && <IntegrationsSection />}
        </div>
      </div>
    </dialog>
  )
}
