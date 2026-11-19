/** localStorage keys for per-person preferences. */
export const STORAGE_KEYS = {
  theme: 'buun-mail:theme',
  density: 'buun-mail:density',
} as const

/** What the person picks; `system` follows the OS. */
export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const
export type ThemePreference = (typeof THEME_PREFERENCES)[number]

/** What is drawn. */
export type Theme = Exclude<ThemePreference, 'system'>

export const DENSITIES = ['comfortable', 'compact'] as const
export type Density = (typeof DENSITIES)[number]

/** The workspace the router keeps for mail no rule claims. Mirrors `UNSORTED_WORKSPACE` in the routing crate. */
export const UNSORTED_WORKSPACE = 'unsorted'

/** What the sidebar calls a workspace's inbox, the folder with no name. */
export const INBOX_LABEL = 'Inbox'

/** The settings sections, in tab order. */
export const SETTINGS_SECTIONS = ['general', 'workspaces', 'integrations'] as const
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

/** The key that opens settings with Ctrl or Cmd, as in most desktop apps. */
export const SETTINGS_SHORTCUT = ','
