import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { DENSITIES, THEME_PREFERENCES } from '../../constants/ui'
import type { Preferences } from '../../hooks/usePreferences'
import { DENSITY_GLYPHS, THEME_GLYPHS } from '../../icons'
import { Segmented } from './Segmented'
import { Switch } from './Switch'
import { LANGUAGES } from '../../i18n/languages'
import type { LanguagePreference } from '../../i18n/languages'
import { Select } from '../Select/Select'

/** Look and feel, saved on this computer. */
export function GeneralSection({ preferences }: { preferences: Preferences }): ReactNode {
  const { t } = useTranslation(['settings', 'common'])
  const themeLabels = { system: t('common:themes.system'), light: t('common:themes.light'), dark: t('common:themes.dark') }
  const densityLabels = { comfortable: t('density.comfortable'), compact: t('density.compact') }
  return (
    <div className="settings__rows">
      <div className="settings__row">
        <div>
          <label htmlFor="language" className="settings__label">
            {t('language.title')}
          </label>
          <p className="settings__hint">{t('language.hint')}</p>
        </div>
        <Select
          id="language"
          value={preferences.language}
          options={[{ value: 'system', label: t('language.system') }, ...LANGUAGES.map((language) => ({ value: language.code, label: language.name }))]}
          onChange={(language) => preferences.setLanguage(language as LanguagePreference)}
        />
      </div>
      <div className="settings__row">
        <div>
          <p id="theme-label" className="settings__label">
            {t('theme.title')}
          </p>
          <p className="settings__hint">{t('theme.hint')}</p>
        </div>
        <Segmented name="theme" labelledBy="theme-label" options={THEME_PREFERENCES} labels={themeLabels} glyphs={THEME_GLYPHS} value={preferences.themePreference} onChange={preferences.setThemePreference} />
      </div>
      <div className="settings__row">
        <div>
          <p id="density-label" className="settings__label">
            {t('density.title')}
          </p>
          <p className="settings__hint">{t('density.hint')}</p>
        </div>
        <Segmented name="density" labelledBy="density-label" options={DENSITIES} labels={densityLabels} glyphs={DENSITY_GLYPHS} value={preferences.density} onChange={preferences.setDensity} />
      </div>
      <div className="settings__row">
        <div>
          <label id="grain-label" htmlFor="grain" className="settings__label">
            {t('grain.title')}
          </label>
          <p className="settings__hint">{t('grain.hint')}</p>
        </div>
        <Switch id="grain" labelledBy="grain-label" checked={preferences.grain} onChange={preferences.setGrain} />
      </div>
    </div>
  )
}
