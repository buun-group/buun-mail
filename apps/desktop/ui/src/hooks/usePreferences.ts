import { useEffect, useState } from 'react'

import { DENSITIES, STORAGE_KEYS, THEME_PREFERENCES } from '../constants/ui'
import type { Density, Theme, ThemePreference } from '../constants/ui'

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
  grain: boolean
  sidebarCollapsed: boolean
  setThemePreference: (value: ThemePreference) => void
  setDensity: (value: Density) => void
  setGrain: (value: boolean) => void
  setSidebarCollapsed: (value: boolean) => void
}

const ON_OFF = ['on', 'off'] as const

/** Theme, density and grain, remembered per person and written to `<html data-theme data-density data-grain>`. */
export function usePreferences(): Preferences {
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(() => read(STORAGE_KEYS.theme, THEME_PREFERENCES, 'system'))
  const [density, setDensityState] = useState<Density>(() => read(STORAGE_KEYS.density, DENSITIES, 'comfortable'))
  const [grain, setGrainState] = useState<boolean>(() => read(STORAGE_KEYS.grain, ON_OFF, 'on') === 'on')
  const [sidebarCollapsed, setSidebarState] = useState<boolean>(() => read(STORAGE_KEYS.sidebar, ['open', 'collapsed'] as const, 'open') === 'collapsed')
  const system = useSystemTheme()
  const theme = themePreference === 'system' ? system : themePreference

  useEffect(() => {
    document.documentElement.dataset['theme'] = theme
    document.documentElement.dataset['density'] = density
    document.documentElement.dataset['grain'] = grain ? 'on' : 'off'
  }, [theme, density, grain])

  return {
    themePreference,
    theme,
    density,
    grain,
    sidebarCollapsed,
    setThemePreference: (value) => {
      setThemePreferenceState(value)
      write(STORAGE_KEYS.theme, value)
    },
    setDensity: (value) => {
      setDensityState(value)
      write(STORAGE_KEYS.density, value)
    },
    setGrain: (value) => {
      setGrainState(value)
      write(STORAGE_KEYS.grain, value ? 'on' : 'off')
    },
    setSidebarCollapsed: (value) => {
      setSidebarState(value)
      write(STORAGE_KEYS.sidebar, value ? 'collapsed' : 'open')
    },
  }
}
