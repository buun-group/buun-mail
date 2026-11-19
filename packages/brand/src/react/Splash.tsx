import type { ReactNode } from 'react'

import { Mark } from './Mark'

/**
 * The launch screen: the letter arrives, the name follows, and when `done` turns true it fades away and stops taking
 * presses. Keep it mounted until the fade ends, or unmount it after `done`.
 */
export function Splash({ done, name = 'Buun Mail', size = 64 }: { done: boolean; name?: string; size?: number }): ReactNode {
  return (
    <div className="bm-splash" data-done={done} aria-hidden={done} role="status" aria-label={done ? undefined : `${name} is opening`}>
      <Mark size={size} motion="arrive" />
      <span className="bm-splash__name" style={{ fontSize: size * 0.34, fontWeight: 650, letterSpacing: '-0.02em' }}>
        {name}
      </span>
    </div>
  )
}
