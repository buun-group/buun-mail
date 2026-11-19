import type { ReactNode } from 'react'

import { colors } from '../tokens'

export interface Route {
  from: string
  to: string
}

/** The drawing's size, in its own units. Rows fit three routes. */
const W = 360
const H = 150
const ROW = 50
const LEFT = 150
const RIGHT = 250

/**
 * What the app does, as a loop: addresses on the left, workspaces on the right, and a small letter running from each
 * address to its workspace in turn. Words come from the caller. For onboarding, the empty state and the site.
 */
export function RouteFlow({ routes, label = 'Mail to each address lands in its own workspace' }: { routes: readonly Route[]; label?: string }): ReactNode {
  const rows = routes.slice(0, 3)
  return (
    <svg className="bm-route" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label} style={{ maxWidth: W, fontFamily: 'inherit' }}>
      {rows.map((route, index) => {
        const y = 25 + index * ROW
        const path = `M${LEFT} ${y} C${LEFT + 50} ${y} ${RIGHT - 50} ${y} ${RIGHT - 12} ${y}`
        return (
          <g key={route.from}>
            <text x={LEFT - 10} y={y + 4} textAnchor="end" fontSize="11" fill="currentColor" opacity="0.65" style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}>
              {route.from}
            </text>
            <path d={path} fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="1.5" strokeDasharray="2 4" />
            <text className="bm-route__lane" x={RIGHT} y={y + 4} fontSize="12" fontWeight="600" fill="currentColor">
              {route.to}
            </text>
            <g className="bm-route__runner" style={{ offsetPath: `path('${path}')` }}>
              <rect x="-7" y="-5" width="14" height="10" rx="2" fill={colors.brand} />
              <path d="M-4.5 -2.5L0 0.8L4.5 -2.5" fill="none" stroke={colors.ink} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          </g>
        )
      })}
    </svg>
  )
}
