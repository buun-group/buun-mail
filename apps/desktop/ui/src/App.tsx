import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'

import { MessageList } from './components/MessageList/MessageList'
import { Reader } from './components/Reader/Reader'
import { Settings } from './components/Settings/Settings'
import { Sidebar } from './components/Sidebar/Sidebar'
import { SETTINGS_SHORTCUT } from './constants/ui'
import { useMailbox } from './hooks/useMailbox'
import { usePreferences } from './hooks/usePreferences'
import { useShortcut } from './hooks/useShortcut'

import './styles/app.css'

/** Three panes (workspaces, the open folder, the open message) and settings over them. */
export function App(): ReactNode {
  const preferences = usePreferences()
  const mailbox = useMailbox()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const openSettings = useCallback(() => setSettingsOpen(true), [])
  useShortcut(SETTINGS_SHORTCUT, openSettings)
  const workspace = mailbox.workspaces.find((item) => item.id === mailbox.place?.workspace)

  if (mailbox.error !== null) {
    return (
      <p role="alert" className="app-error">
        The mailbox could not load: {mailbox.error}
      </p>
    )
  }

  return (
    <div className="app">
      <Sidebar workspaces={mailbox.workspaces} place={mailbox.place} theme={preferences.theme} onOpen={mailbox.open} onSettings={openSettings} />
      <MessageList workspace={workspace} place={mailbox.place} messages={mailbox.messages} selectedId={mailbox.selected?.id ?? null} onSelect={mailbox.select} />
      <Reader message={mailbox.selected} workspace={workspace} theme={preferences.theme} />
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} preferences={preferences} workspaces={mailbox.workspaces} />
    </div>
  )
}
