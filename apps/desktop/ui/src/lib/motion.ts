/** How long the dots take to shrink away. */
export const DISSOLVE_MS = 576

/** How long the space then takes to close. */
export const COLLAPSE_MS = 200

/** True when the person asked for less motion. */
export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
