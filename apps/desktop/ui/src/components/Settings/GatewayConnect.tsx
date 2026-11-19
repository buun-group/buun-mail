import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { isTauri } from '@tauri-apps/api/core'

import { checkGateway, connectGateway, disconnectGateway, gatewayStatus } from '../../api/client'
import type { GatewayStatus } from '../../api/types'
import { formatFull } from '../../lib/time'

/** How often the status refreshes while this panel is open, so the last check and count stay current. */
const REFRESH_MS = 5_000

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/**
 * The mail gateway: paste its address and a mailbox token to connect. Once connected it shows when it last checked,
 * how much it collected and any problem, with Check now and Disconnect.
 */
export function GatewayConnect({ onConnected, onStatus }: { onConnected: () => void; onStatus: (connected: boolean) => void }): ReactNode {
  const { t } = useTranslation('integrations')
  const [status, setStatus] = useState<GatewayStatus | null>(null)
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    gatewayStatus()
      .then((found) => {
        setStatus(found)
        onStatus(found.connected)
      })
      .catch((cause: unknown) => setError(reason(cause)))
  }, [onStatus])

  useEffect(() => {
    load()
    const timer = window.setInterval(load, REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [load])

  if (status === null) return null

  if (status.connected) {
    return (
      <div className="connect">
        <p className="settings__label">{t('gateway.connected', { url: status.url ?? '' })}</p>
        <p className="settings__hint">{status.lastChecked === null ? t('gateway.neverChecked') : t('gateway.lastChecked', { time: formatFull(status.lastChecked) })}</p>
        <p className="settings__hint">{t('gateway.received', { count: status.received })}</p>
        {status.problem !== null && (
          <p role="alert" className="settings__error">
            {status.problem}
          </p>
        )}
        <div className="settings__actions">
          <button type="button" className="settings__button" onClick={() => void checkGateway().then(() => window.setTimeout(load, 1500))}>
            {t('gateway.checkNow')}
          </button>
          <button type="button" className="settings__button settings__button--danger" onClick={() => void disconnectGateway().then((found) => {
            setStatus(found)
            onStatus(false)
          })}>
            {t('gateway.disconnect')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <form
      className="connect"
      onSubmit={(event) => {
        event.preventDefault()
        setBusy(true)
        setError(null)
        connectGateway(url, token)
          .then((connected) => {
            setStatus(connected)
            onStatus(true)
            setToken('')
            onConnected()
          })
          .catch((cause: unknown) => setError(reason(cause)))
          .finally(() => setBusy(false))
      }}
    >
      <div className="connect__field">
        <label htmlFor="gateway-url">{t('gateway.urlLabel')}</label>
        <input id="gateway-url" type="url" value={url} placeholder="https://mail-gateway.buungroup.com" onChange={(event) => setUrl(event.target.value)} autoComplete="off" spellCheck={false} required />
      </div>
      <div className="connect__field">
        <label htmlFor="gateway-token">{t('gateway.tokenLabel')}</label>
        <input id="gateway-token" type="password" value={token} placeholder="bmg_" onChange={(event) => setToken(event.target.value)} autoComplete="off" spellCheck={false} required aria-describedby="gateway-token-hint" />
        <small id="gateway-token-hint">{t('gateway.tokenHint')}</small>
      </div>
      {error !== null && (
        <p role="alert" className="settings__error">
          {error}
        </p>
      )}
      <div className="connect__actions">
        <button type="submit" className="connect__submit" disabled={busy || !isTauri()}>
          {busy ? t('gateway.connecting') : t('gateway.connect')}
        </button>
        {!isTauri() && <p className="connect__note">{t('gateway.desktopOnly')}</p>}
      </div>
    </form>
  )
}
