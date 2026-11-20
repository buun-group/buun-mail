import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { DENSITIES, READING_PANES, THEME_PREFERENCES } from '../../constants/ui'
import type { Preferences } from '../../hooks/usePreferences'
import { openExternal } from '../../api/client'
import type { UpdateCheck } from '../../hooks/useUpdateCheck'
import { DENSITY_GLYPHS, IconExternal, IconGlobe, IconRegenerate, READING_PANE_GLYPHS, THEME_GLYPHS } from '../../icons'
import { BusyButton } from '../Busy/BusyButton'
import { Segmented } from './Segmented'
import { Switch } from './Switch'
import { LANGUAGES } from '../../i18n/languages'
import type { LanguagePreference } from '../../i18n/languages'
import { Select } from '../Select/Select'

/** Look and feel, saved on this computer, and whether to look for a newer release. */
export function GeneralSection({ preferences, updates }: { preferences: Preferences; updates: UpdateCheck }): ReactNode {
  const { t } = useTranslation(['settings', 'common'])
  const themeLabels = { system: t('common:themes.system'), light: t('common:themes.light'), dark: t('common:themes.dark') }
  const densityLabels = { comfortable: t('density.comfortable'), compact: t('density.compact') }
  const paneLabels = { right: t('readingPane.right'), off: t('readingPane.off') }
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
          options={[
            { value: 'system', label: t('language.system'), icon: <IconGlobe aria-hidden="true" /> },
            ...LANGUAGES.map((language) => ({ value: language.code, label: language.name, icon: <img className="select__flag" src={language.flag} alt="" /> })),
          ]}
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
          <p id="reading-pane-label" className="settings__label">
            {t('readingPane.title')}
          </p>
          <p className="settings__hint">{t('readingPane.hint')}</p>
        </div>
        <Segmented name="reading-pane" labelledBy="reading-pane-label" options={READING_PANES} labels={paneLabels} glyphs={READING_PANE_GLYPHS} value={preferences.readingPane} onChange={preferences.setReadingPane} />
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
      <div className="settings__row">
        <div>
          <label id="conversations-label" htmlFor="conversations" className="settings__label">
            {t('conversations.title')}
          </label>
          <p className="settings__hint">{t('conversations.hint')}</p>
        </div>
        <Switch id="conversations" labelledBy="conversations-label" checked={preferences.conversations} onChange={preferences.setConversations} />
      </div>
      <div className="settings__row">
        <div>
          <label id="sender-checks-label" htmlFor="sender-checks" className="settings__label">
            {t('senderChecks.title')}
          </label>
          <p className="settings__hint">{t('senderChecks.hint')}</p>
        </div>
        <Switch id="sender-checks" labelledBy="sender-checks-label" checked={preferences.senderChecks} onChange={preferences.setSenderChecks} />
      </div>
      <div className="settings__row">
        <div>
          <label id="remember-label" htmlFor="remember" className="settings__label">
            {t('remember.title')}
          </label>
          <p className="settings__hint">{t('remember.hint')}</p>
        </div>
        <Switch id="remember" labelledBy="remember-label" checked={preferences.rememberPlace} onChange={preferences.setRememberPlace} />
      </div>
      <div className="settings__row">
        <div>
          <label id="updates-label" htmlFor="updates" className="settings__label">
            {t('updates.title')}
          </label>
          <p className="settings__hint">{t('updates.hint')}</p>
        </div>
        <Switch id="updates" labelledBy="updates-label" checked={preferences.checkUpdates} onChange={preferences.setCheckUpdates} />
      </div>
      <div className="settings__update">
        <p className="settings__hint" role="status">
          {updates.problem !== null
            ? updates.problem
            : updates.found === null
              ? t('updates.unchecked')
              : updates.found.newer
                ? t('updates.newer', { latest: updates.found.latest, current: updates.found.current })
                : t('updates.current', { current: updates.found.current })}
        </p>
        <div className="settings__actions settings__actions--tight">
          <BusyButton className="settings__button" glyph={IconRegenerate} run={updates.checkNow} busyLabel={t('updates.checking')}>
            {t('updates.checkNow')}
          </BusyButton>
          {updates.found?.newer === true && (
            <button type="button" className="settings__button" onClick={() => void openExternal(updates.found?.url ?? '')}>
              <IconExternal aria-hidden="true" />
              {t('updates.get', { version: updates.found.latest })}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
