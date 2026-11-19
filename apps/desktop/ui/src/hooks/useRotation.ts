import { useEffect, useState } from 'react'

/**
 * An index that steps through `count` items every `everyMs`. A step is skipped while `isHeld()` says so (the pointer
 * or focus is on the item), so nobody loses what they were reading. `go` jumps to one directly.
 */
export function useRotation(count: number, everyMs: number, isHeld: () => boolean): { index: number; go: (index: number) => void } {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (count < 2) return
    const timer = window.setInterval(() => {
      if (!isHeld()) setIndex((current) => (current + 1) % count)
    }, everyMs)
    return () => window.clearInterval(timer)
  }, [count, everyMs, isHeld])

  return { index, go: setIndex }
}
