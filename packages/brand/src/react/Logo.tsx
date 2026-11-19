import type { ReactNode } from 'react'

import { Mark } from './Mark'
import type { MarkMotion } from './Mark'

/** The mark and the name, set in the app's own font, for headers. The files in `svg/` carry an outlined version. */
export function Logo({ size = 22, motion = 'still', name = 'Buun Mail', className }: { size?: number; motion?: MarkMotion; name?: string; className?: string }): ReactNode {
  return (
    <span className={['bm-logo', className ?? ''].filter(Boolean).join(' ')} style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.36, fontWeight: 650, letterSpacing: '-0.015em', fontSize: size * 0.68 }}>
      <Mark size={size} motion={motion} />
      <span>{name}</span>
    </span>
  )
}
