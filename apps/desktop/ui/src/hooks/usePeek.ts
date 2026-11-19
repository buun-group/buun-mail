import { useEffect, useState } from 'react'
import type { RefObject } from 'react'

/**
 * True while the pointer is over an element, a wheel scrolls over it, or focus is inside it, and only while `enabled`.
 * Drives the collapsed sidebar sliding open. Listeners are native so the element keeps its own role.
 */
export function usePeek(ref: RefObject<HTMLElement | null>, enabled: boolean): [boolean, (value: boolean) => void] {
  const [peek, setPeek] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (element === null || !enabled) return
    const show = (): void => setPeek(true)
    const hide = (): void => setPeek(false)
    const blur = (event: FocusEvent): void => {
      if (!(event.relatedTarget instanceof Node && element.contains(event.relatedTarget))) setPeek(false)
    }
    element.addEventListener('mouseenter', show)
    element.addEventListener('wheel', show, { passive: true })
    element.addEventListener('focusin', show)
    element.addEventListener('mouseleave', hide)
    element.addEventListener('focusout', blur)
    return () => {
      element.removeEventListener('mouseenter', show)
      element.removeEventListener('wheel', show)
      element.removeEventListener('focusin', show)
      element.removeEventListener('mouseleave', hide)
      element.removeEventListener('focusout', blur)
    }
  }, [ref, enabled])

  return [enabled && peek, setPeek]
}
