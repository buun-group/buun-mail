import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { addGatewayDomain, gatewayAvailableDomains, gatewayDomains, removeGatewayDomain } from '../../api/client'
import type { AvailableDomain, GatewayDomain } from '../../api/types'

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/** A workspace name from a domain: `plotwork.dev` becomes `Plotwork`. */
function nameFor(domain: string): string {
  const first = domain.split('.')[0] ?? domain
  return first.charAt(0).toUpperCase() + first.slice(1)
}

/**
 * The gateway's domains: each with whether its mail really arrives here, removable (which puts its old catch-all
 * back), and a picker to add another from the gateway's Cloudflare account, saying first where that domain's mail goes
 * today.
 */
export function GatewayDomains({ onChanged }: { onChanged: () => void }): ReactNode {
  const { t } = useTranslation('integrations')
  const [owned, setOwned] = useState<GatewayDomain[] | null>(null)
  const [available, setAvailable] = useState<AvailableDomain[]>([])
  const [picked, setPicked] = useState('')
  const [makeWorkspace, setMakeWorkspace] = useState(true)
  const [workspaceName, setWorkspaceName] = useState('')
  const [removing, setRemoving] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    gatewayDomains()
      .then(setOwned)
      .catch((cause: unknown) => setError(reason(cause)))
    gatewayAvailableDomains()
      .then(setAvailable)
      .catch(() => setAvailable([]))
  }, [])
  useEffect(load, [load])

  if (owned === null) return <p className="settings__hint">{t('domains.loading')}</p>
  const choice = available.find((zone) => zone.domain === picked)

  return (
    <section className="gateway-domains" aria-labelledby="gateway-domains-title">
      <h5 id="gateway-domains-title" className="settings__label">
        {t('domains.title')}
      </h5>
      <p className="settings__hint">{t('domains.intro')}</p>

      {owned.length === 0 ? (
        <p className="settings__empty">{t('domains.none')}</p>
      ) : (
        <ul className="gateway-domains__list">
          {owned.map((item) => (
            <li key={item.domain} className="gateway-domains__row">
              <span className="gateway-domains__name">{item.domain}</span>
              <span className="gateway-domains__state" data-state={item.routedHere === null ? 'unknown' : item.routedHere ? 'routed' : 'off'}>
                {item.routedHere === null ? t('domains.unknown') : item.routedHere ? t('domains.routed') : t('domains.notRouted')}
              </span>
              {removing === item.domain ? (
                <span className="gateway-domains__confirm">
                  <span className="settings__hint">{item.previously === null ? t('domains.confirmRemoveOff', { domain: item.domain }) : t('domains.confirmRemove', { domain: item.domain, rule: item.previously })}</span>
                  <button
                    type="button"
                    className="settings__button settings__button--danger"
                    onClick={() => {
                      setRemoving(null)
                      removeGatewayDomain(item.domain)
                        .then(() => {
                          load()
                          onChanged()
                        })
                        .catch((cause: unknown) => setError(reason(cause)))
                    }}
                  >
                    {t('domains.remove')}
                  </button>
                  <button type="button" className="settings__button" onClick={() => setRemoving(null)}>
                    {t('domains.keep')}
                  </button>
                </span>
              ) : (
                <button type="button" className="settings__button" onClick={() => setRemoving(item.domain)}>
                  {t('domains.remove')}
                </button>
              )}
              {item.previously !== null && removing !== item.domain && <span className="gateway-domains__before settings__hint">{t('domains.previously', { rule: item.previously })}</span>}
            </li>
          ))}
        </ul>
      )}

      <form
        className="gateway-domains__add"
        onSubmit={(event) => {
          event.preventDefault()
          if (choice === undefined) return
          setBusy(true)
          setError(null)
          addGatewayDomain(choice.domain, makeWorkspace ? workspaceName.trim() || nameFor(choice.domain) : null)
            .then(() => {
              setPicked('')
              setWorkspaceName('')
              load()
              onChanged()
            })
            .catch((cause: unknown) => setError(reason(cause)))
            .finally(() => setBusy(false))
        }}
      >
        <h6 className="settings__label">{t('domains.add')}</h6>
        {available.length === 0 ? (
          <p className="settings__hint">{t('domains.noneAvailable')}</p>
        ) : (
          <>
            <div className="connect__field">
              <label htmlFor="gateway-domain">{t('domains.choose')}</label>
              <select
                id="gateway-domain"
                className="settings__select"
                value={picked}
                onChange={(event) => {
                  setPicked(event.target.value)
                  setWorkspaceName(nameFor(event.target.value))
                }}
              >
                <option value="">{t('domains.pick')}</option>
                {available.map((zone) => (
                  <option key={zone.domain} value={zone.domain}>
                    {zone.domain}
                  </option>
                ))}
              </select>
            </div>
            {choice !== undefined && (
              <>
                <p className="gateway-domains__warning">{t('domains.warning', { domain: choice.domain, rule: choice.catchAllNow })}</p>
                <label className="rule-editor__check">
                  <input type="checkbox" id="gateway-make-workspace" checked={makeWorkspace} onChange={(event) => setMakeWorkspace(event.target.checked)} />
                  {t('domains.makeWorkspace')}
                </label>
                {makeWorkspace && (
                  <div className="connect__field">
                    <label htmlFor="gateway-workspace-name">{t('domains.workspaceName')}</label>
                    <input id="gateway-workspace-name" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} autoComplete="off" />
                  </div>
                )}
                <div className="connect__actions">
                  <button type="submit" className="connect__submit" disabled={busy}>
                    {busy ? t('domains.adding') : t('domains.addButton')}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </form>
      {error !== null && (
        <p role="alert" className="settings__error">
          {error}
        </p>
      )}
    </section>
  )
}
