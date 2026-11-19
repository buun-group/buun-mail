import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Mark } from '@buun-mail/brand/react'

import { THEME_PREFERENCES } from '../../constants/ui'
import type { ThemePreference } from '../../constants/ui'
import { IconSettings, IconSidebar, THEME_GLYPHS } from '../../icons'
import { TipButton } from '../Tooltip/TipButton'
import { WindowControls } from '../WindowControls/WindowControls'

import './TitleBar.css'

/** The words for each theme, as keys for `t()`. */
const THEME_NAMES = { system: 'common:themes.system', light: 'common:themes.light', dark: 'common:themes.dark' } as const satisfies Record<ThemePreference, string>

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
  const { t } = useTranslation(['sidebar', 'common'])
  const ThemeGlyph = THEME_GLYPHS[themePreference]
  const upcoming = nextTheme(themePreference)
  const sidebarWords = sidebarCollapsed ? t('titleBar.openSidebar') : t('titleBar.collapseSidebar')
  const theme = t(THEME_NAMES[themePreference])

  return (
    <header className="title-bar" data-tauri-drag-region>
      <span className="title-bar__brand" data-tauri-drag-region>
        <Mark size={20} />
        <span data-tauri-drag-region>{t('common:appName')}</span>
      </span>
      <TipButton className="title-bar__button" tip={sidebarWords} aria-label={sidebarWords} aria-pressed={sidebarCollapsed} onClick={() => onSidebarCollapsed(!sidebarCollapsed)}>
        <IconSidebar aria-hidden="true" />
      </TipButton>

      <span className="title-bar__fill" data-tauri-drag-region />

      <span className="title-bar__tools">
        {bell}
        <TipButton className="title-bar__button" tip={t('titleBar.themeTip', { theme })} aria-label={t('titleBar.themeLabel', { theme, next: t(THEME_NAMES[upcoming]) })} onClick={() => onThemePreference(upcoming)}>
          <ThemeGlyph aria-hidden="true" />
        </TipButton>
        <TipButton className="title-bar__button" tip={t('common:settings')} aria-label={t('common:settings')} onClick={onSettings}>
          <IconSettings aria-hidden="true" />
        </TipButton>
      </span>
      <WindowControls />
    </header>
  )
}
