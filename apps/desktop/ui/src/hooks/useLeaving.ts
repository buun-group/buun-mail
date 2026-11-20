import { useCallback, useState } from 'react'

/** An item to draw, and whether it is on its way out. */
export interface Kept<T> {
  item: T
  key: string
  leaving: boolean
}

interface Seen<T> {
  items: readonly T[]
  signature: string
  scope: string
  leaving: Map<string, { item: T; index: number }>
}

/**
 * Keeps items that just left a list on screen, marked leaving, so they can dissolve away where they were; `gone(key)`
 * drops one once its animation has run. Only removals within one `scope` (one folder, one filter) leave this way:
 * opening another folder replaces the list at once. Compares keys, so a list rebuilt each render is fine.
 */
export function useLeaving<T>(items: readonly T[], keyOf: (item: T) => string, scope: string): { list: Kept<T>[]; gone: (key: string) => void } {
  const signature = items.map(keyOf).join('\u0000')
  const [seen, setSeen] = useState<Seen<T>>(() => ({ items, signature, scope, leaving: new Map() }))
  if (seen.signature !== signature || seen.scope !== scope) {
    const sameScope = seen.scope === scope
    const leaving = new Map(sameScope ? seen.leaving : [])
    const now = new Set(items.map(keyOf))
    if (sameScope) {
      seen.items.forEach((item, index) => {
        const key = keyOf(item)
        if (!now.has(key) && !leaving.has(key)) leaving.set(key, { item, index })
      })
    }
    // Something that came back is no longer leaving.
    for (const key of leaving.keys()) if (now.has(key)) leaving.delete(key)
    setSeen({ items, signature, scope, leaving })
  }
  const gone = useCallback((key: string) => {
    setSeen((current) => {
      if (!current.leaving.has(key)) return current
      const leaving = new Map(current.leaving)
      leaving.delete(key)
      return { ...current, leaving }
    })
  }, [])
  const list: Kept<T>[] = items.map((item) => ({ item, key: keyOf(item), leaving: false }))
  ;[...seen.leaving.entries()]
    .sort((a, b) => a[1].index - b[1].index)
    .forEach(([key, { item, index }]) => list.splice(Math.min(index, list.length), 0, { item, key, leaving: true }))
  return { list, gone }
}
