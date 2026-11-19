import type { ReactNode } from 'react'

import './Avatar.css'

/** A workspace's initial in a small neutral square. Decorative: the name is always beside it. */
export function Avatar({ name }: { name: string }): ReactNode {
  return (
    <span className="avatar" aria-hidden="true">
      {name.trim().charAt(0).toUpperCase()}
    </span>
  )
}
