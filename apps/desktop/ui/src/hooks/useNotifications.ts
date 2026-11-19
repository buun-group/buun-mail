import { useCallback, useEffect, useRef, useState } from 'react'

import { onMailArrived } from '../api/events'
import { askToNotify, notify } from '../api/notify'
import type { Message } from '../api/types'
import { NOTIFICATION_FEED_LIMIT, STORAGE_KEYS, TOAST_LIMIT, TOAST_MS } from '../constants/ui'
import i18n from '../i18n'
import { toast as sayInWindow } from '../lib/feedback'

/** What the person chose in Settings, Notifications. Kept on this computer. */
export interface NotificationPrefs {
  /** Desktop notifications while the window is in the background. */
  desktop: boolean
  /** Toasts in the corner while the window is in front. */
  toasts: boolean
  /** Workspace ids that never notify. Their mail still arrives and counts as unread. */
  muted: string[]
}

const DEFAULT_PREFS: NotificationPrefs = { desktop: true, toasts: true, muted: [] }

/** One arrival in the bell's list. */
export interface Arrival {
  message: Message
  seen: boolean
}

export interface Notifications {
  prefs: NotificationPrefs
  setPrefs: (next: Partial<NotificationPrefs>) => void
  /** Turns desktop notifications on, asking the system first. Resolves to whether it was allowed. */
  enableDesktop: () => Promise<boolean>
  feed: Arrival[]
  unseen: number
  markAllSeen: () => void
  clear: () => void
  toasts: Message[]
  dismissToast: (id: string) => void
  /** Shows a sample new-mail toast, and a desktop notification when those are on, for Settings' Try it. */
  sendTest: (workspace: string) => void
  /** True for a sample from `sendTest`, which opens nothing when clicked. */
  isTest: (id: string) => boolean
}

/** The id every sample toast starts with. */
const TEST_ID = 'notification-test-'


function load(): NotificationPrefs {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEYS.notifications) ?? '{}')
    return typeof parsed === 'object' && parsed !== null ? { ...DEFAULT_PREFS, ...(parsed as Partial<NotificationPrefs>) } : DEFAULT_PREFS
  } catch {
    return DEFAULT_PREFS
  }
}

/**
 * New mail, told three ways: the bell's list always, a toast while the window is in front, a desktop notification
 * while it is behind. Muted workspaces skip the toast and the desktop notification but still reach the list.
 */
export function useNotifications(workspaceName: (id: string) => string): Notifications {
  const [prefs, setPrefsState] = useState<NotificationPrefs>(load)
  const [feed, setFeed] = useState<Arrival[]>([])
  const [toasts, setToasts] = useState<Message[]>([])
  // The arrival listener is set up once; it reads the latest choices through this ref.
  const latest = useRef({ prefs, workspaceName })
  useEffect(() => {
    latest.current = { prefs, workspaceName }
  })

  const setPrefs = useCallback((next: Partial<NotificationPrefs>) => {
    setPrefsState((current) => {
      const merged = { ...current, ...next }
      try {
        localStorage.setItem(STORAGE_KEYS.notifications, JSON.stringify(merged))
      } catch {
        // Storage can be off; the choice still holds for this session.
      }
      return merged
    })
  }, [])

  const dismissToast = useCallback((id: string) => setToasts((current) => current.filter((toast) => toast.id !== id)), [])

  useEffect(
    () =>
      onMailArrived((messages) => {
        const { prefs: now, workspaceName: nameOf } = latest.current
        setFeed((current) => [...messages.map((message) => ({ message, seen: false })), ...current].slice(0, NOTIFICATION_FEED_LIMIT))
        const loud = messages.filter((message) => !now.muted.includes(message.workspace))
        if (loud.length === 0) return
        if (document.hasFocus()) {
          if (now.toasts) setToasts((current) => [...loud, ...current].slice(0, TOAST_LIMIT))
        } else if (now.desktop) {
          const [first] = loud
          if (first !== undefined) {
            const title = loud.length === 1 ? i18n.t('notifications:desktop.one', { name: first.fromName, workspace: nameOf(first.workspace) }) : i18n.t('notifications:desktop.many', { count: loud.length })
            void notify(title, loud.length === 1 ? first.subject : loud.map((message) => message.subject).join(i18n.t('notifications:desktop.separator')))
          }
        }
      }),
    [],
  )

  // Each toast leaves on its own after a while.
  useEffect(() => {
    const [oldest] = toasts.slice(-1)
    if (oldest === undefined) return
    const timer = window.setTimeout(() => dismissToast(oldest.id), TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [toasts, dismissToast])

  return {
    prefs,
    setPrefs,
    enableDesktop: async () => {
      const allowed = await askToNotify()
      setPrefs({ desktop: allowed })
      return allowed
    },
    feed,
    unseen: feed.filter((arrival) => !arrival.seen).length,
    markAllSeen: () => setFeed((current) => current.map((arrival) => ({ ...arrival, seen: true }))),
    clear: () => setFeed([]),
    toasts,
    dismissToast,
    sendTest: (workspace) => {
      const sample: Message = {
        id: `${TEST_ID}${Date.now()}`,
        workspace,
        folder: null,
        fromName: i18n.t('notifications:test.sender'),
        from: 'hello@buungroup.com',
        to: 'you@buungroup.com',
        matched: null,
        folderMatched: null,
        subject: i18n.t('notifications:test.subject'),
        preview: '',
        receivedAt: new Date().toISOString(),
        unread: true,
        starred: false,
        shelf: 'active',
        tags: [],
        threadId: null,
        threadSize: 1,
      }
      if (prefs.toasts) setToasts((current) => [sample, ...current].slice(0, TOAST_LIMIT))
      else sayInWindow({ text: i18n.t('notifications:test.toastsOff'), detail: i18n.t('notifications:test.toastsOffDetail'), tone: 'info' })
      if (prefs.desktop) void notify(i18n.t('notifications:desktop.one', { name: sample.fromName, workspace: workspaceName(workspace) }), sample.subject)
    },
    isTest: (id) => id.startsWith(TEST_ID),
  }
}
