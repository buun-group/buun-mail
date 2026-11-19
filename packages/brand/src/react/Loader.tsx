import type { ReactNode } from 'react'

import { Mark } from './Mark'

/** The waiting state: the letter hovering, its streaks pulsing. `label` is read out and, if `showLabel`, shown. */
export function Loader({ size = 32, label = 'Loading', showLabel = false }: { size?: number; label?: string; showLabel?: boolean }): ReactNode {
  return (
    <span role="status" style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <Mark size={size} motion="loader" />
      <span style={showLabel ? { fontSize: 13, opacity: 0.7 } : { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>{label}</span>
    </span>
  )
}
