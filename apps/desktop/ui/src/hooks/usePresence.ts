import { useEffect, useState } from 'react'

import { reducedMotion } from '../lib/motion'

/** What a part that opens and closes is doing. */
export type Phase = 'opening' | 'open' | 'closing' | 'closed'

interface Seen {
  open: boolean
  phase: Phase
}

/** The latest a close may take before the part goes anyway, in case its animation never reports that it ended. */
const CLOSE_LIMIT_MS = 500

/**
 * Keeps a part on screen while it animates closed, and marks it opening when it opens after the first render (never
 * at start, so nothing animates as the app opens). Call `settle` from the part's `onAnimationEnd`.
 */
export function usePresence(open: boolean): { mounted: boolean; phase: Phase; settle: () => void } {
  const [seen, setSeen] = useState<Seen>({ open, phase: open ? 'open' : 'closed' })
  if (seen.open !== open) {
    const still = reducedMotion()
    setSeen({ open, phase: open ? (still ? 'open' : 'opening') : still || seen.phase === 'closed' ? 'closed' : 'closing' })
  }
  const settle = (): void => setSeen((current) => ({ ...current, phase: current.open ? 'open' : 'closed' }))

  useEffect(() => {
    if (seen.phase !== 'closing') return undefined
    const timer = window.setTimeout(() => setSeen((current) => (current.phase === 'closing' ? { ...current, phase: 'closed' } : current)), CLOSE_LIMIT_MS)
    return () => window.clearTimeout(timer)
  }, [seen.phase])

  return { mounted: seen.phase !== 'closed', phase: seen.phase, settle }
}
