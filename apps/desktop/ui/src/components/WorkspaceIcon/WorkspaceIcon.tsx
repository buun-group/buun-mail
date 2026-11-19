import type { ReactNode } from 'react'

import { BRAND_ICONS, isBrandIcon } from '../../constants/products'
import type { Theme } from '../../constants/ui'
import type { WorkspaceLook } from '../../hooks/useWorkspaceLooks'
import { isWorkspaceGlyph, WORKSPACE_GLYPHS } from '../../icons'

import './WorkspaceIcon.css'

interface WorkspaceIconProps {
  name: string
  /** The routing file's icon key: a glyph or a Buun Group mark. */
  icon: string | null
  theme: Theme
  /** The look chosen in settings, which wins over `icon`. */
  look?: WorkspaceLook | undefined
  size?: 'sm' | 'md'
}

/**
 * A workspace's face: the image, mark or glyph chosen in settings, else the routing file's icon, else its initial.
 * Decorative: the name is always written beside it.
 */
export function WorkspaceIcon({ name, icon, theme, look, size = 'sm' }: WorkspaceIconProps): ReactNode {
  const className = `workspace-icon workspace-icon--${size}`
  if (look?.kind === 'image') return <img className={className} src={look.src} alt="" aria-hidden="true" />
  const key = look?.kind === 'glyph' ? look.key : icon
  if (isBrandIcon(key)) {
    return (
      <span className={`${className} workspace-icon--brand`} aria-hidden="true">
        <img src={BRAND_ICONS[key].mark[theme]} alt="" />
      </span>
    )
  }
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
