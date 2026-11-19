import type { ReactNode } from 'react'

import { Mark } from '@buun-mail/brand/react'

import { THEME_PREFERENCES } from '../../constants/ui'
import type { ThemePreference } from '../../constants/ui'
import { IconSettings, IconSidebar, THEME_GLYPHS } from '../../icons'
import { TipButton } from '../Tooltip/TipButton'
import { WindowControls } from '../WindowControls/WindowControls'

import './TitleBar.css'

const THEME_NAMES: Record<ThemePreference, string> = { system: 'Match system', light: 'Light', dark: 'Dark' }

/** The theme after this one: Match system, Light, Dark, then round again. */
function nextTheme(current: ThemePreference): ThemePreference {
  return THEME_PREFERENCES[(THEME_PREFERENCES.indexOf(current) + 1) % THEME_PREFERENCES.length] ?? 'system'
}

interface TitleBarProps {
  themePreference: ThemePreference
  onThemePreference: (value: ThemePreference) => void
  sidebarCollapsed: boolean
  onSidebarCollapsed: (collapsed: boolean) => void
  onSettings: () => void
  /** The notification bell, drawn by the app. */
  bell: ReactNode
}

/**
 * The bar along the top of the window: the mark and the sidebar toggle on the left, the app-wide buttons on the
 * right, then the window's own minimise, maximise and close. The whole bar drags the window; double-click maximises.
 * On macOS the native traffic lights sit at its left edge and the mark moves clear of them.
 */
export function TitleBar({ themePreference, onThemePreference, sidebarCollapsed, onSidebarCollapsed, onSettings, bell }: TitleBarProps): ReactNode {
  const ThemeGlyph = THEME_GLYPHS[themePreference]
  const upcoming = nextTheme(themePreference)
  const sidebarWords = sidebarCollapsed ? 'Keep the sidebar open' : 'Collapse the sidebar'

  return (
    <header className="title-bar" data-tauri-drag-region>
      <span className="title-bar__brand" data-tauri-drag-region>
        <Mark size={20} />
        <span data-tauri-drag-region>Buun Mail</span>
      </span>
      <TipButton className="title-bar__button" tip={sidebarWords} aria-label={sidebarWords} aria-pressed={sidebarCollapsed} onClick={() => onSidebarCollapsed(!sidebarCollapsed)}>
        <IconSidebar aria-hidden="true" />
      </TipButton>

      <span className="title-bar__fill" data-tauri-drag-region />

      <span className="title-bar__tools">
        {bell}
        <TipButton className="title-bar__button" tip={`${THEME_NAMES[themePreference]} theme`} aria-label={`Theme: ${THEME_NAMES[themePreference]}. Switch to ${THEME_NAMES[upcoming]}`} onClick={() => onThemePreference(upcoming)}>
          <ThemeGlyph aria-hidden="true" />
        </TipButton>
        <TipButton className="title-bar__button" tip="Settings" aria-label="Settings" onClick={onSettings}>
          <IconSettings aria-hidden="true" />
        </TipButton>
      </span>
      <WindowControls />
    </header>
  )
}
