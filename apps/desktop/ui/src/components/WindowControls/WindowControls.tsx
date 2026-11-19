import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { closeWindow, hasOwnTitleBar, minimizeWindow, toggleMaximizeWindow, watchMaximized } from '../../api/window'
import { IconClose, IconMaximize, IconMinimize, IconRestore } from '../../icons'

import './WindowControls.css'

/** Minimise, maximise and close, drawn by the app on Windows and Linux. Nothing on macOS or in a plain browser. */
export function WindowControls(): ReactNode {
  const { t } = useTranslation(['sidebar', 'common'])
  const [maximized, setMaximized] = useState(false)
  useEffect(() => (hasOwnTitleBar ? watchMaximized(setMaximized) : undefined), [])
  if (!hasOwnTitleBar) return null

  return (
    <div className="window-controls">
      <button type="button" className="window-controls__button" aria-label={t('window.minimise')} onClick={() => void minimizeWindow()}>
        <IconMinimize aria-hidden="true" />
      </button>
      <button type="button" className="window-controls__button" aria-label={maximized ? t('window.restore') : t('window.maximise')} onClick={() => void toggleMaximizeWindow()}>
        {maximized ? <IconRestore aria-hidden="true" /> : <IconMaximize aria-hidden="true" />}
      </button>
      <button type="button" className="window-controls__button window-controls__button--close" aria-label={t('common:close')} onClick={() => void closeWindow()}>
        <IconClose aria-hidden="true" />
      </button>
    </div>
  )
}
