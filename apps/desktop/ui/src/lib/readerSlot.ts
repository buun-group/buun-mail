import { useSyncExternalStore } from 'react'

/**
 * The reading pane's element, for things that sit inside it rather than over the whole window, such as the agent
 * identity drawer. The Reader hands its section over with `registerReaderSlot` as a ref; it changes element when a
 * message opens or closes, and is null while the reading pane is hidden.
 */
let slot: HTMLElement | null = null
const listeners = new Set<() => void>()

/** A callback ref for the reading pane's root element. */
export function registerReaderSlot(element: HTMLElement | null): void {
  if (element === null) {
    // When one section replaces another the old one's null can come either side of the new one's element, so
    // forget the slot only once it has really left the page.
    queueMicrotask(() => {
      if (slot !== null && !slot.isConnected) change(null)
    })
    return
  }
  change(element)
}

function change(next: HTMLElement | null): void {
  if (slot === next) return
  slot = next
  for (const listener of listeners) listener()
}

/** The reading pane's element now, or null when there is none. */
export function useReaderSlot(): HTMLElement | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => slot,
    () => null,
  )
}
