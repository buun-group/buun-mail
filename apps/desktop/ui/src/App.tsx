import { Splash } from '@buun-mail/brand/react'
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Confirm } from './components/Confirm/Confirm'
import { Grain } from './components/Grain/Grain'
import { NotificationBell } from './components/NotificationBell/NotificationBell'
import { TitleBar } from './components/TitleBar/TitleBar'
import { Toasts } from './components/Toasts/Toasts'
import { MessageList } from './components/MessageList/MessageList'
import { Reader } from './components/Reader/Reader'
import { Settings } from './components/Settings/Settings'
import { Sidebar } from './components/Sidebar/Sidebar'
import { INBOX_LABEL, SETTINGS_SHORTCUT } from './constants/ui'
import type { SettingsSection } from './constants/ui'
import { useFolded } from './hooks/useFolded'
import { openMessage } from './api/client'
import type { Message } from './api/types'
import { Compose } from './components/Compose/Compose'
import { DraftsList } from './components/Compose/DraftsList'
import { useCompose } from './hooks/useCompose'
import { useMailbox } from './hooks/useMailbox'
import { useSending } from './hooks/useSending'
import type { ComposeMode } from './lib/compose'
import { readLastPlace, writeLastPlace } from './lib/lastPlace'
import { useMailKeys } from './hooks/useMailKeys'
import { useMessageActions } from './hooks/useMessageActions'
import { useNotifications } from './hooks/useNotifications'
import { usePreferences } from './hooks/usePreferences'
import { useShortcut } from './hooks/useShortcut'
import { useWorkspaceLooks } from './hooks/useWorkspaceLooks'

import './styles/app.css'

/** Three panes (workspaces, the open folder, the open message) and settings over them. */
export function App(): ReactNode {
  const { t } = useTranslation(['mail', 'common'])
  const preferences = usePreferences()
  // Read once at start: where the person left off, when they want that.
  const [restore] = useState(() => (preferences.rememberPlace ? readLastPlace() : null))
  const mailbox = useMailbox(restore)
  const looks = useWorkspaceLooks()
  const folded = useFolded()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [section, setSection] = useState<SettingsSection>('general')
  const [editing, setEditing] = useState<string | null>(null)
  const openSettings = useCallback(() => setSettingsOpen(true), [])
  const focusSearch = useCallback(() => document.getElementById('search')?.focus(), [])
  const editIcon = (id: string): void => {
    setSection('workspaces')
    setEditing(id)
    setSettingsOpen(true)
  }
  useShortcut(SETTINGS_SHORTCUT, openSettings)
  useShortcut('f', focusSearch)
  const selectedId = mailbox.selected?.message.id ?? null
  // Remembers where the person is as they move, or forgets it when they turn that off.
  useEffect(() => {
    writeLastPlace(preferences.rememberPlace && mailbox.ready ? { place: mailbox.place, view: mailbox.view, selectedId } : null)
  }, [preferences.rememberPlace, mailbox.ready, mailbox.place, mailbox.view, selectedId])
  // The web view's own menu (back, reload, inspect) means nothing in a mail app. Fields keep theirs, for cut and paste.
  useEffect(() => {
    const quiet = (event: MouseEvent): void => {
      if (!(event.target instanceof Element && event.target.closest('input, textarea, [contenteditable="true"]') !== null)) event.preventDefault()
    }
    window.addEventListener('contextmenu', quiet)
    return () => window.removeEventListener('contextmenu', quiet)
  }, [])
  const workspace = mailbox.workspaces.find((item) => item.id === mailbox.place?.workspace)
  const openWorkspace = mailbox.workspaces.find((item) => item.id === mailbox.selected?.message.workspace)
  const workspaceName = (id: string): string => mailbox.workspaces.find((item) => item.id === id)?.name ?? id
  const notifications = useNotifications(workspaceName)
  const sending = useSending()
  const compose = useCompose(mailbox.workspaces, sending.sendable, () => mailbox.refresh())
  /** Starts a reply, reply all or forward of `message`, reading its text first when it is not the open one. */
  const composeFor = (mode: ComposeMode, message: Message): void => {
    const open = mailbox.selected
    if (open !== null && open.message.id === message.id && open.body !== null) {
      compose.start(mode, { message, body: open.body, recipients: open.recipients })
      return
    }
    openMessage(message.id)
      .then((detail) => compose.start(mode, { message: detail.message, body: detail.body, recipients: detail.recipients }))
      .catch(() => compose.start(mode, { message, body: message.preview, recipients: null }))
  }
  const actions = useMessageActions(mailbox, workspaceName, { canReply: (message) => sending.can(message.to), canForward: sending.any, start: composeFor })
  // Lifts the toasts above the compose panel while it is open.
  useEffect(() => {
    if (compose.open === null) delete document.documentElement.dataset['composing']
    else document.documentElement.dataset['composing'] = compose.minimized ? 'min' : 'true'
  }, [compose.open, compose.minimized])
  useMailKeys(mailbox.selected?.message ?? null, mailbox.messages, mailbox.select, actions, preferences.readingPane === 'off' ? mailbox.close : null, {
    compose: () => {
      if (sending.any) compose.start('new', null)
    },
    reply: (mode, message) => {
      if (mode === 'forward' ? sending.any : sending.can(message.to)) composeFor(mode, message)
    },
  })

  const openIntegrations = (): void => {
    setSection('integrations')
    setSettingsOpen(true)
  }

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
    <div className="app" data-sidebar={preferences.sidebarCollapsed ? 'collapsed' : 'open'} data-reading={preferences.readingPane} data-open={mailbox.selected !== null}>
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
        view={mailbox.view}
        theme={preferences.theme}
        looks={looks.looks}
        folded={folded.folded}
        collapsed={preferences.sidebarCollapsed}
        onOpen={mailbox.open}
        onOpenView={mailbox.openView}
        onCompose={() => (sending.any ? compose.start('new', null) : openIntegrations())}
        canCompose={sending.any}
        draftCount={compose.drafts.length}
        onFold={folded.toggle}
        onEditIcon={editIcon}
        onResetIcon={(id) => looks.set(id, null)}
        onMarkAllRead={mailbox.markAllRead}
      />
      {mailbox.view === 'drafts' ? (
        <DraftsList compose={compose} />
      ) : (
      <MessageList
        workspace={workspace}
        place={mailbox.place}
        view={mailbox.view}
        messages={mailbox.messages}
        selectedId={mailbox.selected?.message.id ?? null}
        onSelect={mailbox.select}
        actions={actions}
        workspaceName={workspaceName}
        theme={preferences.theme}
        sort={mailbox.sort}
        onSort={mailbox.setSort}
        filter={mailbox.filter}
        onFilter={mailbox.setFilter}
        total={mailbox.total}
        looks={looks.looks}
        query={mailbox.query}
        onQuery={mailbox.setQuery}
        wide={preferences.readingPane === 'off'}
      />
      )}
      <Reader
        message={mailbox.selected?.message ?? null}
        body={mailbox.selected?.body ?? null}
        recipients={mailbox.selected?.recipients ?? null}
        detail={mailbox.selected?.detail ?? null}
        workspace={openWorkspace}
        theme={preferences.theme}
        onAddTag={mailbox.addTag}
        onRemoveTag={mailbox.removeTag}
        tagSuggestions={mailbox.tags}
        actions={actions}
        onBack={preferences.readingPane === 'off' ? mailbox.close : null}
        onOpenIntegrations={openIntegrations}
        canReply={mailbox.selected !== null && sending.can(mailbox.selected.message.to)}
        canForward={sending.any}
        onCompose={(mode) => {
          if (mailbox.selected !== null) composeFor(mode, mailbox.selected.message)
        }}
        backTo={mailbox.view === null ? (mailbox.place?.folder ?? t(INBOX_LABEL)) : t(`views.${mailbox.view}`)}
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
        onSendersChanged={sending.refresh}
      />
      <Compose compose={compose} workspaces={mailbox.workspaces} sendable={sending.sendable} />
      <Toasts toasts={notifications.toasts} workspaceName={workspaceName} onOpen={(message) => (notifications.isTest(message.id) ? undefined : mailbox.reveal(message))} onDismiss={notifications.dismissToast} />
      <Confirm request={actions.confirmation} cancelLabel={t('actions.cancel')} onClose={actions.closeConfirmation} />
      {preferences.grain && <Grain />}
      <Splash done={mailbox.ready} />
    </div>
  )
}
