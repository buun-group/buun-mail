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
  setThemePreference: (value: ThemePreference) => void
  setDensity: (value: Density) => void
}

/** Theme and density, remembered per person and written to `<html data-theme data-density>`. */
export function usePreferences(): Preferences {
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(() => read(STORAGE_KEYS.theme, THEME_PREFERENCES, 'system'))
  const [density, setDensityState] = useState<Density>(() => read(STORAGE_KEYS.density, DENSITIES, 'comfortable'))
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
    setThemePreference: (value) => {
      setThemePreferenceState(value)
      write(STORAGE_KEYS.theme, value)
    },
    setDensity: (value) => {
      setDensityState(value)
      write(STORAGE_KEYS.density, value)
    },
  }
}
