import { useId } from 'react'
import type { ReactNode } from 'react'

/**
 * The Buun Mail mark, Arrival: a letter tilted in flight with two streaks behind it, a sibling of the Flung mark. The
 * streaks take the text colour around it; the letter keeps its own orange. `src-tauri/icons/mark.svg` is the same
 * drawing for the app icon; change both together.
 */
export function BrandMark({ size = 20, label }: { size?: number; label?: string }): ReactNode {
  const gradient = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role={label === undefined ? undefined : 'img'} aria-label={label} aria-hidden={label === undefined ? true : undefined}>
      <defs>
        <linearGradient id={gradient} gradientUnits="userSpaceOnUse" x1="3" y1="3" x2="29" y2="29">
          <stop offset="0" stopColor="var(--mark-light)" />
          <stop offset="0.55" stopColor="var(--brand-100)" />
          <stop offset="1" stopColor="var(--mark-deep)" />
        </linearGradient>
      </defs>
      <g transform="rotate(-12 19 16)">
        <rect x="9.5" y="8.5" width="19" height="14.5" rx="3.2" fill={`url(#${gradient})`} />
        <path d="M12.5 12L19 16.6L25.5 12" fill="none" stroke="var(--mark-ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <path d="M2.5 13H6.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M3.5 19.5H7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.55" />
    </svg>
  )
}
