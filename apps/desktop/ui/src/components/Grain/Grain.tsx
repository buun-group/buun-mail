import type { ReactNode } from 'react'

import './Grain.css'

/**
 * The paper grain: one layer under the panes and one blended over them, as on buungroup.com. Real elements rather
 * than body pseudo-elements, so turning the grain off removes them in every engine, WebKitGTK included.
 */
export function Grain(): ReactNode {
  return (
    <>
      <div className="grain grain--under" aria-hidden="true" />
      <div className="grain grain--over" aria-hidden="true" />
    </>
  )
}
