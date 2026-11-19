import type { ReactNode } from 'react'

import { DENSITIES, THEME_PREFERENCES } from '../../constants/ui'
import type { Preferences } from '../../hooks/usePreferences'
import { DENSITY_GLYPHS, THEME_GLYPHS } from '../../icons'
import { Segmented } from './Segmented'
import { Switch } from './Switch'

const THEME_LABELS = { system: 'Match system', light: 'Light', dark: 'Dark' } as const
const DENSITY_LABELS = { comfortable: 'Comfortable', compact: 'Compact' } as const

/** Look and feel, saved on this computer. */
export function GeneralSection({ preferences }: { preferences: Preferences }): ReactNode {
  return (
    <div className="settings__rows">
      <div className="settings__row">
        <div>
          <p className="settings__label">Theme</p>
          <p className="settings__hint">Match system follows your computer between light and dark.</p>
        </div>
        <Segmented name="theme" options={THEME_PREFERENCES} labels={THEME_LABELS} glyphs={THEME_GLYPHS} value={preferences.themePreference} onChange={preferences.setThemePreference} />
      </div>
      <div className="settings__row">
        <div>
          <p className="settings__label">Message list</p>
          <p className="settings__hint">Compact fits more messages on screen.</p>
        </div>
        <Segmented name="density" options={DENSITIES} labels={DENSITY_LABELS} glyphs={DENSITY_GLYPHS} value={preferences.density} onChange={preferences.setDensity} />
      </div>
      <div className="settings__row">
        <div>
          <p id="grain-label" className="settings__label">Paper grain</p>
          <p className="settings__hint">A fine texture over the window, as on buungroup.com.</p>
        </div>
        <Switch id="grain" labelledBy="grain-label" checked={preferences.grain} onChange={preferences.setGrain} />
      </div>
    </div>
  )
}
