import type { ReactNode } from 'react'

/**
 * Work under way, drawn as a letter in flight: an envelope easing forward and back while speed lines stream out
 * behind it, in the brand's Arrival style rather than a spinning icon. Sized and coloured like any glyph (1em,
 * currentColor). With reduced motion the lines only breathe.
 */
export function BusyGlyph({ className }: { className?: string }): ReactNode {
  return (
    <svg className={`busy-glyph${className === undefined ? '' : ` ${className}`}`} viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <g className="busy-glyph__streaks" strokeWidth="1.6">
        <path className="busy-glyph__streak" d="M1.5 9.5H7" />
        <path className="busy-glyph__streak busy-glyph__streak--2" d="M3 12.5H7" />
        <path className="busy-glyph__streak busy-glyph__streak--3" d="M1.5 15.5H7" />
      </g>
      <g className="busy-glyph__letter" strokeWidth="1.5">
        <rect x="9" y="6.5" width="13" height="11" rx="2.2" />
        <path d="M9.6 7.6L15.5 12.2L21.4 7.6" />
      </g>
    </svg>
  )
}
