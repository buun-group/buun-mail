import type { ReactNode } from 'react'

import type { WorkspaceLook } from '../../hooks/useWorkspaceLooks'
import { isWorkspaceGlyph, WORKSPACE_GLYPHS } from '../../icons'

import './WorkspaceIcon.css'

interface WorkspaceIconProps {
  name: string
  /** The routing file's glyph key. */
  icon: string | null
  /** The look chosen in settings, which wins over `icon`. */
  look?: WorkspaceLook | undefined
  size?: 'sm' | 'md'
}

/**
 * A workspace's face: the image or glyph chosen in settings, else the routing file's glyph, else its initial.
 * Decorative: the name is always written beside it.
 */
export function WorkspaceIcon({ name, icon, look, size = 'sm' }: WorkspaceIconProps): ReactNode {
  const className = `workspace-icon workspace-icon--${size}`
  if (look?.kind === 'image') return <img className={className} src={look.src} alt="" aria-hidden="true" />
  const key = look?.kind === 'glyph' ? look.key : icon
  if (!isWorkspaceGlyph(key)) {
    return (
      <span className={className} aria-hidden="true">
        {name.trim().charAt(0).toUpperCase()}
      </span>
    )
  }
  const Glyph = WORKSPACE_GLYPHS[key]
  return (
    <span className={className} aria-hidden="true">
      <Glyph />
    </span>
  )
}
