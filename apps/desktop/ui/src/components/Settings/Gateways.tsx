import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { isTauri } from '@tauri-apps/api/core'

import { addGateway, checkGateways, listGateways, removeGateway } from '../../api/client'
import type { GatewayStatus } from '../../api/types'
import { formatFull } from '../../lib/time'
import { GatewayDomains } from './GatewayDomains'

/** How often the list refreshes while open, so each gateway's last check and count stay current. */
const REFRESH_MS = 5_000

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error))

interface GatewaysProps {
  /** Called when mail or workspaces may have changed, so the mailbox reloads. */
  onChanged: () => void
  /** Tells the row header how many gateways are connected. */
  onCount: (count: number) => void
}

/**
 * Every mail gateway this app collects from (usually one per Cloudflare account), each with how its checks are going,
 * its domains, Check now and Remove; and a form to add another.
 */
export function Gateways({ onChanged, onCount }: GatewaysProps): ReactNode {
  const { t } = useTranslation('integrations')
  const [gateways, setGateways] = useState<GatewayStatus[] | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const show = useCallback(
    (list: GatewayStatus[]) => {
      setGateways(list)
      onCount(list.length)
    },
    [onCount],
  )

  const load = useCallback(() => {
    listGateways()
      .then(show)
      .catch((cause: unknown) => setError(reason(cause)))
  }, [show])

  useEffect(() => {
    load()
    const timer = window.setInterval(load, REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [load])

  if (gateways === null) return null

  return (
    <div className="gateways">
      {gateways.length === 0 && <p className="settings__hint">{t('gateway.none')}</p>}
      {gateways.map((gateway) => (
        <section key={gateway.id} className="gateway" aria-labelledby={`gateway-${gateway.id}`}>
          <h5 id={`gateway-${gateway.id}`} className="settings__label">
            {gateway.name}
          </h5>
          <p className="settings__mono">{gateway.url}</p>
          <p className="settings__hint">
            {gateway.lastChecked === null ? t('gateway.neverChecked') : t('gateway.lastChecked', { time: formatFull(gateway.lastChecked) })} {t('gateway.received', { count: gateway.received })}
          </p>
          {gateway.problem !== null && (
            <p role="alert" className="settings__error">
              {gateway.problem}
            </p>
          )}
          <div className="settings__actions settings__actions--tight">
            <button type="button" className="settings__button" onClick={() => void checkGateways().then(() => window.setTimeout(load, 1500))}>
              {t('gateway.checkNow')}
            </button>
            {removing === gateway.id ? (
              <>
                <span className="settings__hint">{t('gateway.confirmRemove', { name: gateway.name })}</span>
                <button type="button" className="settings__button settings__button--danger" onClick={() => void removeGateway(gateway.id).then(show)}>
                  {t('gateway.remove')}
                </button>
                <button type="button" className="settings__button" onClick={() => setRemoving(null)}>
                  {t('gateway.keep')}
                </button>
              </>
            ) : (
              <button type="button" className="settings__button" onClick={() => setRemoving(gateway.id)}>
                {t('gateway.remove')}
              </button>
            )}
          </div>
          <GatewayDomains gatewayId={gateway.id} onChanged={onChanged} />
        </section>
      ))}
      <AddGateway
        first={gateways.length === 0}
        onAdded={(list) => {
          show(list)
          onChanged()
        }}
      />
      {error !== null && (
        <p role="alert" className="settings__error">
          {error}
        </p>
      )}
    </div>
  )
}

/** The form that adds a gateway: a name for it, its address, and the mailbox token. */
function AddGateway({ first, onAdded }: { first: boolean; onAdded: (list: GatewayStatus[]) => void }): ReactNode {
  const { t } = useTranslation('integrations')
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      className="connect gateway__add"
      onSubmit={(event) => {
        event.preventDefault()
        setBusy(true)
        setError(null)
        addGateway(name, url, token)
          .then((list) => {
            setName('')
            setUrl('')
            setToken('')
            onAdded(list)
          })
          .catch((cause: unknown) => setError(reason(cause)))
          .finally(() => setBusy(false))
      }}
    >
      <h5 className="settings__label">{first ? t('gateway.addGateway') : t('gateway.addAnother')}</h5>
      <div className="connect__field">
        <label htmlFor="gateway-name">{t('gateway.nameLabel')}</label>
        <input id="gateway-name" value={name} placeholder={t('gateway.namePlaceholder')} onChange={(event) => setName(event.target.value)} autoComplete="off" />
      </div>
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
