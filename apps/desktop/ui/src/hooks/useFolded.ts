import { useCallback, useState } from 'react'

import { STORAGE_KEYS } from '../constants/ui'

function load(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEYS.folded) ?? '[]')
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [])
  } catch {
    return new Set()
  }
}

/** The workspaces whose folders are folded away in the sidebar, remembered on this computer. */
export function useFolded(): { folded: Set<string>; toggle: (id: string) => void } {
  const [folded, setFolded] = useState<Set<string>>(load)
  const toggle = useCallback((id: string) => {
    setFolded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try {
        localStorage.setItem(STORAGE_KEYS.folded, JSON.stringify([...next]))
      } catch {
        // Storage can be off; the fold still holds for this session.
      }
      return next
    })
  }, [])
  return { folded, toggle }
}
