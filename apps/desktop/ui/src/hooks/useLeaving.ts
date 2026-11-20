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
  /** The scope just changed and its own items have not come yet: the next change is a replacement, not removals. */
  settling: boolean
}

/**
 * Keeps items that just left a list on screen, marked leaving, so they can dissolve away where they were; `gone(key)`
 * drops one once its animation has run. Only removals within one `scope` (one folder, one filter) leave this way:
 * opening another folder replaces the list at once, also when its items arrive a moment after the scope changes.
 * Compares keys, so a list rebuilt each render is fine.
 */
export function useLeaving<T>(items: readonly T[], keyOf: (item: T) => string, scope: string): { list: Kept<T>[]; gone: (key: string) => void } {
  const signature = items.map(keyOf).join('\u0000')
  const [seen, setSeen] = useState<Seen<T>>(() => ({ items, signature, scope, leaving: new Map(), settling: false }))
  if (seen.signature !== signature || seen.scope !== scope) {
    const scopeChanged = seen.scope !== scope
    const now = new Set(items.map(keyOf))
    const before = new Set(seen.items.map(keyOf))
    // Only a pure removal in a settled scope leaves: opening a folder swaps the place a moment before its messages
    // arrive, and that swap must not play the old folder's messages dissolving.
    const removalOnly = [...now].every((key) => before.has(key))
    const animate = !scopeChanged && !seen.settling && removalOnly
    const leaving = new Map(animate ? seen.leaving : [])
    if (animate) {
      seen.items.forEach((item, index) => {
        const key = keyOf(item)
        if (!now.has(key) && !leaving.has(key)) leaving.set(key, { item, index })
      })
    }
    // Something that came back is no longer leaving.
    for (const key of leaving.keys()) if (now.has(key)) leaving.delete(key)
    setSeen({ items, signature, scope, leaving, settling: scopeChanged && seen.signature === signature })
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
