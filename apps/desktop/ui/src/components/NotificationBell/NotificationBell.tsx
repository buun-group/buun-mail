import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

import type { Message } from '../../api/types'
import type { Arrival } from '../../hooks/useNotifications'
import { IconBell, IconBellOff } from '../../icons'
import { placeNear } from '../../lib/place'
import { formatReceived } from '../../lib/time'
import { TipButton } from '../Tooltip/TipButton'

import './NotificationBell.css'

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
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const Glyph = quiet ? IconBellOff : IconBell
  const close = (): void => setAnchor(null)

  return (
    <>
      <TipButton
        className="sidebar__icon notification-bell sidebar__tool"
        tip={unseen > 0 ? `${unseen} new` : 'Notifications'}
        aria-label={unseen > 0 ? `Notifications, ${unseen} new` : 'Notifications'}
        aria-expanded={anchor !== null}
        aria-haspopup="dialog"
        onClick={(event) => {
          setAnchor(anchor === null ? event.currentTarget.getBoundingClientRect() : null)
          onSeen()
        }}
      >
        <Glyph aria-hidden="true" />
        {unseen > 0 && <span className="notification-bell__badge">{unseen > 9 ? '9+' : unseen}</span>}
      </TipButton>
      {anchor !== null &&
        createPortal(
          <Panel anchor={anchor} onClose={close}>
            <header className="notification-panel__head">
              <h2>Notifications</h2>
              <span>
                <button type="button" onClick={onClear} disabled={feed.length === 0}>
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => {
                    close()
                    onSettings()
                  }}
                >
                  Settings
                </button>
              </span>
            </header>
            {feed.length === 0 ? (
              <p className="notification-panel__empty">New mail shows here as it arrives.</p>
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
  const panel = useRef<HTMLDivElement | null>(null)
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (panel.current !== null) setPlace(placeNear(anchor, panel.current.getBoundingClientRect(), 'below', 6, 'start'))
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
    <div ref={panel} role="dialog" aria-label="Notifications" className="notification-panel" style={place === null ? { visibility: 'hidden' } : place}>
      {children}
    </div>
  )
}
