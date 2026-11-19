/** The localStorage key for the chosen theme. */
export const THEME_STORAGE_KEY = 'buun-mail:theme'

export const THEMES = ['light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

/** The workspace the router keeps for mail no rule claims. Mirrors `UNSORTED_WORKSPACE` in the routing crate. */
export const UNSORTED_WORKSPACE = 'unsorted'

/** What the sidebar calls a workspace's inbox, the folder with no name. */
export const INBOX_LABEL = 'Inbox'
