import { useSyncExternalStore } from 'react'

/** Below this width the window is narrow: the sidebar folds to its rail and the reading pane opens over the list. */
export const NARROW_QUERY = '(max-width: 900px)'

const media = (): MediaQueryList | null => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(NARROW_QUERY) : null)

/** True while the window is narrower than {@link NARROW_QUERY}, following it as the window is resized. */
export function useNarrowWindow(): boolean {
  return useSyncExternalStore(
    (listener) => {
      const list = media()
      list?.addEventListener('change', listener)
      return () => list?.removeEventListener('change', listener)
    },
    () => media()?.matches ?? false,
    () => false,
  )
}
