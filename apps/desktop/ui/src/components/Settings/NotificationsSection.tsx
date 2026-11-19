import { useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { isTauri } from '@tauri-apps/api/core'

import type { Workspace } from '../../api/types'
import type { Notifications } from '../../hooks/useNotifications'
import { Switch } from './Switch'

/** How new mail tells you it arrived, and which workspaces stay quiet. Saved on this computer. */
export function NotificationsSection({ notifications, workspaces }: { notifications: Notifications; workspaces: Workspace[] }): ReactNode {
  const { t } = useTranslation('notifications')
  const { prefs, setPrefs, enableDesktop } = notifications
  const [refused, setRefused] = useState(false)

  return (
    <>
      <p className="settings__intro">{t('section.intro')}</p>
      <div className="settings__rows">
        <div className="settings__row">
          <div>
            <label id="toasts-label" htmlFor="toasts" className="settings__label">
              {t('section.toasts')}
            </label>
            <p className="settings__hint">{t('section.toastsHint')}</p>
          </div>
          <Switch id="toasts" labelledBy="toasts-label" checked={prefs.toasts} onChange={(toasts) => setPrefs({ toasts })} />
        </div>
        <div className="settings__row">
          <div>
            <label id="desktop-label" htmlFor="desktop" className="settings__label">
              {t('section.desktop')}
            </label>
            <p className="settings__hint">{refused ? t('section.desktopRefused') : isTauri() ? t('section.desktopAsks') : t('section.desktopAppOnly')}</p>
          </div>
          <Switch
            id="desktop"
            labelledBy="desktop-label"
            checked={prefs.desktop}
            onChange={(on) => {
              if (!on) {
                setPrefs({ desktop: false })
                return
              }
              void enableDesktop().then((allowed) => setRefused(!allowed))
            }}
          />
        </div>
      </div>

      <section className="settings__group" aria-labelledby="mute-title">
        <h4 id="mute-title" className="settings__group-title">
          {t('section.workspaces')}
        </h4>
        <ul className="settings__list">
          {workspaces.map((workspace) => {
            const id = `notify-${workspace.id}`
            const muted = prefs.muted.includes(workspace.id)
            return (
              <li key={workspace.id} className="settings__row">
                <label id={`${id}-label`} htmlFor={id} className="settings__label">
                  {workspace.name}
                </label>
                <Switch
                  id={id}
                  labelledBy={`${id}-label`}
                  checked={!muted}
                  onChange={(on) => setPrefs({ muted: on ? prefs.muted.filter((item) => item !== workspace.id) : [...prefs.muted, workspace.id] })}
                />
              </li>
            )
          })}
        </ul>
      </section>
    </>
  )
}
