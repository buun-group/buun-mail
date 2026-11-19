import { useEffect } from 'react'

/** Runs `action` on Ctrl or Cmd plus `key`, anywhere in the window. */
export function useShortcut(key: string, action: () => void): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key === key) {
        event.preventDefault()
        action()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [key, action])
}
