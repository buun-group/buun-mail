import { useState } from 'react'
import type { ReactNode } from 'react'

import { isTauri } from '@tauri-apps/api/core'

import type { Workspace } from '../../api/types'
import type { Notifications } from '../../hooks/useNotifications'
import { Switch } from './Switch'

/** How new mail tells you it arrived, and which workspaces stay quiet. Saved on this computer. */
export function NotificationsSection({ notifications, workspaces }: { notifications: Notifications; workspaces: Workspace[] }): ReactNode {
  const { prefs, setPrefs, enableDesktop } = notifications
  const [refused, setRefused] = useState(false)

  return (
    <>
      <p className="settings__intro">New mail always shows under the bell. While the window is in front it also pops up in the corner; while it is behind, your computer shows a notification.</p>
      <div className="settings__rows">
        <div className="settings__row">
          <div>
            <label id="toasts-label" htmlFor="toasts" className="settings__label">
              Pop-ups in the window
            </label>
            <p className="settings__hint">A short note in the corner, gone after a few seconds.</p>
          </div>
          <Switch id="toasts" labelledBy="toasts-label" checked={prefs.toasts} onChange={(toasts) => setPrefs({ toasts })} />
        </div>
        <div className="settings__row">
          <div>
            <label id="desktop-label" htmlFor="desktop" className="settings__label">
              Desktop notifications
            </label>
            <p className="settings__hint">{refused ? 'Your system said no. Allow Buun Mail in its notification settings, then try again.' : isTauri() ? 'Asks your system the first time.' : 'Available in the desktop app.'}</p>
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
          Workspaces
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
