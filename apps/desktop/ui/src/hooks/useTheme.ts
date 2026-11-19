import { useCallback, useEffect, useState } from 'react'

import { THEME_STORAGE_KEY, THEMES } from '../constants/ui'
import type { Theme } from '../constants/ui'

function stored(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return THEMES.find((theme) => theme === value) ?? null
  } catch {
    return null
  }
}

function system(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** The theme: what the person chose last, else the system's. Written to `<html data-theme>`. */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(() => stored() ?? system())

  useEffect(() => {
    document.documentElement.dataset['theme'] = theme
  }, [theme])

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark'
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next)
      } catch {
        // Storage can be off; the theme still changes for this session.
      }
      return next
    })
  }, [])

  return { theme, toggle }
}
