import { Splash } from '@buun-mail/brand/react'
import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Grain } from './components/Grain/Grain'
import { NotificationBell } from './components/NotificationBell/NotificationBell'
import { TitleBar } from './components/TitleBar/TitleBar'
import { Toasts } from './components/Toasts/Toasts'
import { MessageList } from './components/MessageList/MessageList'
import { Reader } from './components/Reader/Reader'
import { Settings } from './components/Settings/Settings'
import { Sidebar } from './components/Sidebar/Sidebar'
import { SETTINGS_SHORTCUT } from './constants/ui'
import type { SettingsSection } from './constants/ui'
import { useFolded } from './hooks/useFolded'
import { useMailbox } from './hooks/useMailbox'
import { useNotifications } from './hooks/useNotifications'
import { usePreferences } from './hooks/usePreferences'
import { useShortcut } from './hooks/useShortcut'
import { useWorkspaceLooks } from './hooks/useWorkspaceLooks'

import './styles/app.css'

/** Three panes (workspaces, the open folder, the open message) and settings over them. */
export function App(): ReactNode {
  const { t } = useTranslation('mail')
  const preferences = usePreferences()
  const mailbox = useMailbox()
  const looks = useWorkspaceLooks()
  const folded = useFolded()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [section, setSection] = useState<SettingsSection>('general')
  const [editing, setEditing] = useState<string | null>(null)
  const openSettings = useCallback(() => setSettingsOpen(true), [])
  const editIcon = (id: string): void => {
    setSection('workspaces')
    setEditing(id)
    setSettingsOpen(true)
  }
  useShortcut(SETTINGS_SHORTCUT, openSettings)
  const workspace = mailbox.workspaces.find((item) => item.id === mailbox.place?.workspace)
  const workspaceName = (id: string): string => mailbox.workspaces.find((item) => item.id === id)?.name ?? id
  const notifications = useNotifications(workspaceName)

  const openNotificationSettings = (): void => {
    setSection('notifications')
    setSettingsOpen(true)
  }

  if (mailbox.error !== null) {
    return (
      <p role="alert" className="app-error">
        {t('loadError', { error: mailbox.error })}
      </p>
    )
  }

  return (
    <div className="app" data-sidebar={preferences.sidebarCollapsed ? 'collapsed' : 'open'}>
      <TitleBar
        themePreference={preferences.themePreference}
        onThemePreference={preferences.setThemePreference}
        sidebarCollapsed={preferences.sidebarCollapsed}
        onSidebarCollapsed={preferences.setSidebarCollapsed}
        onSettings={openSettings}
        bell={
          <NotificationBell
            feed={notifications.feed}
            unseen={notifications.unseen}
            quiet={!notifications.prefs.toasts && !notifications.prefs.desktop}
            workspaceName={workspaceName}
            onOpenMessage={mailbox.reveal}
            onSeen={notifications.markAllSeen}
            onClear={notifications.clear}
            onSettings={openNotificationSettings}
          />
        }
      />
      <Sidebar
        workspaces={mailbox.workspaces}
        place={mailbox.place}
        theme={preferences.theme}
        looks={looks.looks}
        folded={folded.folded}
        collapsed={preferences.sidebarCollapsed}
        onOpen={mailbox.open}
        onFold={folded.toggle}
        onEditIcon={editIcon}
        onResetIcon={(id) => looks.set(id, null)}
        onMarkAllRead={mailbox.markAllRead}
      />
      <MessageList workspace={workspace} place={mailbox.place} messages={mailbox.messages} selectedId={mailbox.selected?.message.id ?? null} onSelect={mailbox.select} />
      <Reader
        message={mailbox.selected?.message ?? null}
        body={mailbox.selected?.body ?? null}
        workspace={workspace}
        theme={preferences.theme}
        onAddTag={mailbox.addTag}
        onRemoveTag={mailbox.removeTag}
        tagSuggestions={mailbox.tags}
      />
      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        preferences={preferences}
        workspaces={mailbox.workspaces}
        looks={looks.looks}
        onLook={looks.set}
        section={section}
        onSection={setSection}
        editing={editing}
        onEditing={setEditing}
        onImported={mailbox.refresh}
        notifications={notifications}
      />
      <Toasts toasts={notifications.toasts} workspaceName={workspaceName} onOpen={mailbox.reveal} onDismiss={notifications.dismissToast} />
      {preferences.grain && <Grain />}
      <Splash done={mailbox.ready} />
    </div>
  )
}
