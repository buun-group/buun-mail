import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import type { Message } from '../../api/types'
import type { Arrival } from '../../hooks/useNotifications'
import { IconBell, IconBellOff, IconBellRinging } from '../../icons'
import { placeNear } from '../../lib/place'
import { formatReceived } from '../../lib/time'
import { TipButton } from '../Tooltip/TipButton'

import './NotificationBell.css'
import { holdAndLeave } from '../../lib/motion'

interface NotificationBellProps {
  feed: Arrival[]
  unseen: number
  /** True when every notification is off, so the bell shows it is quiet. */
  quiet: boolean
  workspaceName: (id: string) => string
  onOpenMessage: (message: Message) => void
  onSeen: () => void
  onClear: () => void
  onSettings: () => void
}

/** The bell in the header: a count of new arrivals, and a panel listing them. Opening the panel marks them seen. */
export function NotificationBell({ feed, unseen, quiet, workspaceName, onOpenMessage, onSeen, onClear, onSettings }: NotificationBellProps): ReactNode {
  const { t } = useTranslation(['notifications', 'common'])
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const Glyph = quiet ? IconBellOff : unseen > 0 ? IconBellRinging : IconBell
  const close = (): void => setAnchor(null)

  return (
    <>
      <TipButton
        className="title-bar__button notification-bell"
        data-new={unseen > 0}
        tip={unseen > 0 ? t('bell.newTip', { count: unseen }) : t('common:notifications')}
        aria-label={unseen > 0 ? t('bell.newLabel', { count: unseen }) : t('common:notifications')}
        aria-expanded={anchor !== null}
        aria-haspopup="dialog"
        onClick={(event) => {
          setAnchor(anchor === null ? event.currentTarget.getBoundingClientRect() : null)
          onSeen()
        }}
      >
        <Glyph aria-hidden="true" />
        {unseen > 0 && <span className="notification-bell__count">{unseen > 9 ? t('bell.badgeMany') : unseen}</span>}
      </TipButton>
      {anchor !== null &&
        createPortal(
          <Panel anchor={anchor} onClose={close}>
            <header className="notification-panel__head">
              <h2>{t('common:notifications')}</h2>
              <span>
                <button type="button" onClick={onClear} disabled={feed.length === 0}>
                  {t('bell.clear')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    close()
                    onSettings()
                  }}
                >
                  {t('common:settings')}
                </button>
              </span>
            </header>
            {feed.length === 0 ? (
              <p className="notification-panel__empty">{t('bell.empty')}</p>
            ) : (
              <ul className="notification-panel__list">
                {feed.map(({ message }) => (
                  <li key={message.id}>
                    <button
                      type="button"
                      onClick={() => {
                        close()
                        onOpenMessage(message)
                      }}
                    >
                      <span className="notification-panel__top">
                        <strong>{message.fromName}</strong>
                        <time dateTime={message.receivedAt}>{formatReceived(message.receivedAt)}</time>
                      </span>
                      <span className="notification-panel__subject">{message.subject}</span>
                      <span className="notification-panel__where">{workspaceName(message.workspace)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>,
          document.body,
        )}
    </>
  )
}

/** A floating panel under its button, kept in the window, closed by Escape or a press outside it. */
function Panel({ anchor, onClose, children }: { anchor: DOMRect; onClose: () => void; children: ReactNode }): ReactNode {
  const { t } = useTranslation(['notifications', 'common'])
  const panel = useRef<HTMLDivElement | null>(null)
  const panelRef = useCallback((element: HTMLDivElement | null) => holdAndLeave(panel, element), [])
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (panel.current !== null) setPlace(placeNear(anchor, panel.current.getBoundingClientRect(), 'below', 6, 'end'))
  }, [anchor])

  useEffect(() => {
    const away = (event: PointerEvent): void => {
      if (!(event.target instanceof Node && panel.current?.contains(event.target))) onClose()
    }
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', away, true)
    window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('pointerdown', away, true)
      window.removeEventListener('keydown', escape)
    }
  }, [onClose])

  return (
    <div ref={panelRef} role="dialog" aria-label={t('common:notifications')} className="notification-panel" style={place === null ? { visibility: 'hidden' } : place}>
      {children}
    </div>
  )
}
