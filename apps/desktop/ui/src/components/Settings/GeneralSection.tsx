import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { DENSITIES, THEME_PREFERENCES } from '../../constants/ui'
import type { Preferences } from '../../hooks/usePreferences'
import { DENSITY_GLYPHS, THEME_GLYPHS } from '../../icons'
import { Segmented } from './Segmented'
import { Switch } from './Switch'
import { LANGUAGES } from '../../i18n/languages'
import type { LanguagePreference } from '../../i18n/languages'

const THEME_LABELS = { system: 'Match system', light: 'Light', dark: 'Dark' } as const
const DENSITY_LABELS = { comfortable: 'Comfortable', compact: 'Compact' } as const

/** Look and feel, saved on this computer. */
export function GeneralSection({ preferences }: { preferences: Preferences }): ReactNode {
  const { t } = useTranslation('settings')
  return (
    <div className="settings__rows">
      <div className="settings__row">
        <div>
          <label htmlFor="language" className="settings__label">
            {t('language.title')}
          </label>
          <p className="settings__hint">{t('language.hint')}</p>
        </div>
        <select id="language" className="settings__select" value={preferences.language} onChange={(event) => preferences.setLanguage(event.target.value as LanguagePreference)}>
          <option value="system">{t('language.system')}</option>
          {LANGUAGES.map((language) => (
            <option key={language.code} value={language.code}>
              {language.name}
            </option>
          ))}
        </select>
      </div>
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
          <label id="grain-label" htmlFor="grain" className="settings__label">
            Paper grain
          </label>
          <p className="settings__hint">A fine texture over the window, as on buungroup.com.</p>
        </div>
        <Switch id="grain" labelledBy="grain-label" checked={preferences.grain} onChange={preferences.setGrain} />
      </div>
    </div>
  )
}
