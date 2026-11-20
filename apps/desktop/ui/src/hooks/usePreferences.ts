import { useEffect, useState } from 'react'

import { DENSITIES, READING_PANES, STORAGE_KEYS, THEME_PREFERENCES } from '../constants/ui'
import { applyLanguage, storedLanguage } from '../i18n'
import { resolveLanguage } from '../i18n/languages'
import type { LanguagePreference } from '../i18n/languages'
import type { Density, ReadingPane, Theme, ThemePreference } from '../constants/ui'

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return allowed.find((item) => item === value) ?? fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage can be off; the choice still holds for this session.
  }
}

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** Follows the OS theme while the person has chosen `system`. */
function useSystemTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(() => (window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'))
  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY)
    const onChange = (event: MediaQueryListEvent): void => setTheme(event.matches ? 'dark' : 'light')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return theme
}

export interface Preferences {
  themePreference: ThemePreference
  theme: Theme
  density: Density
  readingPane: ReadingPane
  /** Reopen on the folder, view and message that were open when the app closed. */
  rememberPlace: boolean
  /** Show one row per conversation, its newest message, instead of every message. */
  conversations: boolean
  /** Show each message's sender checks and size in the list. */
  senderChecks: boolean
  grain: boolean
  sidebarCollapsed: boolean
  language: LanguagePreference
  setThemePreference: (value: ThemePreference) => void
  setDensity: (value: Density) => void
  setReadingPane: (value: ReadingPane) => void
  setRememberPlace: (value: boolean) => void
  setConversations: (value: boolean) => void
  setSenderChecks: (value: boolean) => void
  setGrain: (value: boolean) => void
  setSidebarCollapsed: (value: boolean) => void
  setLanguage: (value: LanguagePreference) => void
}

const ON_OFF = ['on', 'off'] as const

/** Theme, density, grain and sidebar, remembered per person. Theme and density are written to `<html data-theme data-density>`. */
export function usePreferences(): Preferences {
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(() => read(STORAGE_KEYS.theme, THEME_PREFERENCES, 'system'))
  const [density, setDensityState] = useState<Density>(() => read(STORAGE_KEYS.density, DENSITIES, 'comfortable'))
  const [readingPane, setReadingPaneState] = useState<ReadingPane>(() => read(STORAGE_KEYS.readingPane, READING_PANES, 'right'))
  const [rememberPlace, setRememberState] = useState<boolean>(() => read(STORAGE_KEYS.rememberPlace, ON_OFF, 'on') === 'on')
  const [conversations, setConversationsState] = useState<boolean>(() => read(STORAGE_KEYS.conversations, ON_OFF, 'on') === 'on')
  const [senderChecks, setSenderChecksState] = useState<boolean>(() => read(STORAGE_KEYS.senderChecks, ON_OFF, 'on') === 'on')
  const [grain, setGrainState] = useState<boolean>(() => read(STORAGE_KEYS.grain, ON_OFF, 'on') === 'on')
  const [sidebarCollapsed, setSidebarState] = useState<boolean>(() => read(STORAGE_KEYS.sidebar, ['open', 'collapsed'] as const, 'open') === 'collapsed')
  const [language, setLanguageState] = useState<LanguagePreference>(storedLanguage)
  const system = useSystemTheme()
  const theme = themePreference === 'system' ? system : themePreference

  useEffect(() => {
    document.documentElement.dataset['theme'] = theme
    document.documentElement.dataset['density'] = density
  }, [theme, density])

  return {
    themePreference,
    theme,
    density,
    readingPane,
    rememberPlace,
    conversations,
    senderChecks,
    grain,
    sidebarCollapsed,
    language,
    setThemePreference: (value) => {
      setThemePreferenceState(value)
      write(STORAGE_KEYS.theme, value)
    },
    setDensity: (value) => {
      setDensityState(value)
      write(STORAGE_KEYS.density, value)
    },
    setReadingPane: (value) => {
      setReadingPaneState(value)
      write(STORAGE_KEYS.readingPane, value)
    },
    setRememberPlace: (value) => {
      setRememberState(value)
      write(STORAGE_KEYS.rememberPlace, value ? 'on' : 'off')
    },
    setConversations: (value) => {
      setConversationsState(value)
      write(STORAGE_KEYS.conversations, value ? 'on' : 'off')
    },
    setSenderChecks: (value) => {
      setSenderChecksState(value)
      write(STORAGE_KEYS.senderChecks, value ? 'on' : 'off')
    },
    setGrain: (value) => {
      setGrainState(value)
      write(STORAGE_KEYS.grain, value ? 'on' : 'off')
    },
    setSidebarCollapsed: (value) => {
      setSidebarState(value)
      write(STORAGE_KEYS.sidebar, value ? 'collapsed' : 'open')
    },
    setLanguage: (value) => {
      setLanguageState(value)
      write(STORAGE_KEYS.language, value)
      applyLanguage(resolveLanguage(value))
    },
  }
}
