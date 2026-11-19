/** localStorage keys for per-person preferences. */
export const STORAGE_KEYS = {
  theme: 'buun-mail:theme',
  density: 'buun-mail:density',
  grain: 'buun-mail:grain',
  sidebar: 'buun-mail:sidebar',
  folded: 'buun-mail:folded-workspaces',
  notifications: 'buun-mail:notifications',
  language: 'buun-mail:language',
  readingPane: 'buun-mail:reading-pane',
  looks: 'buun-mail:workspace-looks',
} as const

/** A workspace image is drawn at this many pixels square before it is kept, so storage stays small. */
export const WORKSPACE_IMAGE_PX = 64

/** The largest image a person may pick for a workspace, before it is shrunk. */
export const WORKSPACE_IMAGE_MAX_BYTES = 5_000_000

/** What the person picks; `system` follows the OS. */
export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const
export type ThemePreference = (typeof THEME_PREFERENCES)[number]

/** What is drawn. */
export type Theme = Exclude<ThemePreference, 'system'>

export const DENSITIES = ['comfortable', 'compact'] as const
export type Density = (typeof DENSITIES)[number]

/** Where an open message shows: beside the list, or in place of it with the list across the whole window (Outlook's reading pane off). */
export const READING_PANES = ['right', 'off'] as const
export type ReadingPane = (typeof READING_PANES)[number]

/** The workspace the router keeps for mail no rule claims. Mirrors `UNSORTED_WORKSPACE` in the routing crate. */
export const UNSORTED_WORKSPACE = 'unsorted'

/** The words the sidebar calls a workspace's inbox, the folder with no name: a key for `t()`. */
export const INBOX_LABEL = 'common:inbox'

/** The settings sections, in tab order. */
export const SETTINGS_SECTIONS = ['general', 'notifications', 'workspaces', 'rules', 'integrations', 'agents'] as const
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

/** The key that opens settings with Ctrl or Cmd, as in most desktop apps. */
export const SETTINGS_SHORTCUT = ','

/** How many arrivals the bell keeps. */
export const NOTIFICATION_FEED_LIMIT = 30

/** How long a toast stays before it leaves on its own. */
export const TOAST_MS = 6_000

/** At most this many toasts show at once; older ones leave first. */
export const TOAST_LIMIT = 3

/** The list's columns, which its headers sort by. */
export const SORT_KEYS = ['from', 'subject', 'received'] as const
export type SortKey = (typeof SORT_KEYS)[number]

/** How the list is ordered: by a column, one way or the other. Newest first to start. */
export interface ListSort {
  key: SortKey
  descending: boolean
}
