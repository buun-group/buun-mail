import { useSyncExternalStore } from 'react'
import type { IconType } from 'react-icons'

/** How a change went: done, worth knowing, or a problem. The tone shows on the glyph only. */
export type FeedbackTone = 'done' | 'info' | 'problem'

export interface Feedback {
  id: number
  text: string
  /** A quieter second line. */
  detail?: string
  tone: FeedbackTone
  /** Overrides the tone's own glyph, such as an archive box for "Archived". */
  glyph?: IconType
  /** Puts things back as they were, when the change can be undone. */
  undo?: () => void
  /** True while it animates away. */
  leaving: boolean
}

/** How long a toast stays: longer when it can be undone or reports a problem. */
const STAY_MS = { plain: 4_000, lasting: 7_000 }

/** How long the leaving animation runs; matches `toast-out` in Toasts.css. */
export const LEAVE_MS = 200

/** At most this many feedback toasts at once; the oldest goes first. */
const MOST = 3

let items: Feedback[] = []
let next = 1
const listeners = new Set<() => void>()
const changed = (list: Feedback[]): void => {
  items = list
  listeners.forEach((listener) => listener())
}

/** Starts a toast leaving, and removes it once the animation has run. */
export function dismissFeedback(id: number): void {
  if (!items.some((item) => item.id === id && !item.leaving)) return
  changed(items.map((item) => (item.id === id ? { ...item, leaving: true } : item)))
  window.setTimeout(() => changed(items.filter((item) => item.id !== id)), LEAVE_MS)
}

/**
 * Says what just happened, in a toast at the bottom right that animates away on its own. Callable from anywhere: a
 * hook, a settings panel or a plain function.
 */
export function toast(feedback: Omit<Feedback, 'id' | 'leaving'>): number {
  const id = next++
  const live = items.filter((item) => !item.leaving)
  if (live.length >= MOST && live[0] !== undefined) dismissFeedback(live[0].id)
  changed([...items, { ...feedback, id, leaving: false }])
  window.setTimeout(() => dismissFeedback(id), feedback.undo !== undefined || feedback.tone === 'problem' ? STAY_MS.lasting : STAY_MS.plain)
  return id
}

/** The toasts showing now, for the one place that draws them. */
export function useFeedback(): Feedback[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => items,
  )
}
