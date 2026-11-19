import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { agentStatus, listActivity, regenerateAgentToken, setAgentEnabled } from '../../api/client'
import type { Activity, AgentStatus } from '../../api/types'
import { ACTIVITY_SHOWN, AGENT_CLIENTS } from '../../constants/agents'
import type { AgentClientId } from '../../constants/agents'
import { AGENT_CLIENT_GLYPHS, IconCopy, IconHide, IconRegenerate, IconShow } from '../../icons'
import { copyWithToast } from '../../lib/copy'
import { formatReceived } from '../../lib/time'
import { Switch } from './Switch'

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/**
 * Agent access: turn the MCP server on, copy what each client needs, and see what agents (and rules, and you) changed.
 */
export function AgentsSection(): ReactNode {
  const { t } = useTranslation(['agents', 'common'])
  const [status, setStatus] = useState<AgentStatus | null>(null)
  const [activity, setActivity] = useState<Activity[]>([])
  const [client, setClient] = useState<AgentClientId>('claude')
  const [showToken, setShowToken] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    agentStatus()
      .then(setStatus)
      .catch((cause: unknown) => setError(reason(cause)))
    listActivity(ACTIVITY_SHOWN)
      .then(setActivity)
      .catch(() => setActivity([]))
  }, [])
  useEffect(load, [load])

  const copy = (label: string, text: string, from: Element): void => {
    void copyWithToast(text, label, from).then((done) => setCopied(done ? label : t('copyFailed')))
  }

  /** Who made a change: an agent by its name, a rule as "Rule: name", or you. */
  const actorName = (actor: string): string => {
    const named = actor.replace(/^agent:/, '')
    return named.startsWith('rule:') ? t('activity.rule', { name: named.slice('rule:'.length) }) : named
  }

  if (status === null) return <p className="settings__empty">{t('loading')}</p>
  const chosen = AGENT_CLIENTS.find((item) => item.id === client) ?? AGENT_CLIENTS[0]
  const token = showToken ? status.token : '*'.repeat(24)

  return (
    <>
      <p className="settings__intro">{t('intro')}</p>

      <div className="settings__rows">
        <div className="settings__row">
          <div>
            <label id="agents-label" htmlFor="agents" className="settings__label">
              {t('allow')}
            </label>
            <p className="settings__hint">{status.problem ?? (status.running ? t('listening', { url: status.url }) : t('off'))}</p>
          </div>
          <Switch id="agents" labelledBy="agents-label" checked={status.enabled} onChange={(enabled) => void setAgentEnabled(enabled).then(setStatus).catch((cause: unknown) => setError(reason(cause)))} />
        </div>
        <div className="settings__row">
          <div className="agent-token">
            <span className="settings__label">{t('token.title')}</span>
            <code>{token}</code>
          </div>
          <span className="settings__actions settings__actions--tight">
            <button type="button" className="settings__icon-button" aria-label={showToken ? t('token.hide') : t('token.show')} onClick={() => setShowToken(!showToken)}>
              {showToken ? <IconHide aria-hidden="true" /> : <IconShow aria-hidden="true" />}
            </button>
            <button type="button" className="settings__icon-button" aria-label={t('token.copy')} onClick={(event) => copy(t('token.copied'), status.token, event.currentTarget)}>
              <IconCopy aria-hidden="true" />
            </button>
            {confirming ? (
              <button
                type="button"
                className="settings__button settings__button--danger"
                onClick={() => {
                  setConfirming(false)
                  void regenerateAgentToken().then(setStatus)
                }}
              >
                {t('token.regenerateConfirm')}
              </button>
            ) : (
              <button type="button" className="settings__icon-button" aria-label={t('token.regenerate')} onClick={() => setConfirming(true)}>
                <IconRegenerate aria-hidden="true" />
              </button>
            )}
          </span>
        </div>
      </div>

      <section className="settings__group" aria-labelledby="connect-title">
        <h4 id="connect-title" className="settings__group-title">
          {t('connect.title')}
        </h4>
        <div className="agent-clients" role="tablist" aria-label={t('connect.clientsLabel')}>
          {AGENT_CLIENTS.map((item) => {
            const Glyph = AGENT_CLIENT_GLYPHS[item.id]
            return (
              <button key={item.id} type="button" role="tab" id={`client-${item.id}`} aria-selected={item.id === client} aria-controls="client-panel" className="agent-clients__tab" onClick={() => setClient(item.id)}>
                <span className={`agent-clients__logo logo--${item.id}`} aria-hidden="true">
                  <Glyph />
                </span>
                {t(item.name)}
              </button>
            )
          })}
        </div>
        {chosen !== undefined && (
          <div id="client-panel" role="tabpanel" aria-labelledby={`client-${chosen.id}`} className="agent-snippet">
            <div className="agent-snippet__head">
              <span className="settings__hint">{chosen.file === undefined ? t(chosen.where) : t('connect.whereFile', { path: chosen.file })}</span>
              <button type="button" className="settings__button" onClick={(event) => copy(t('connect.setupCopied', { name: t(chosen.name) }), chosen.snippet(status.url, status.token), event.currentTarget)}>
                <IconCopy aria-hidden="true" />
                {t('common:copy')}
              </button>
            </div>
            <pre>{chosen.snippet(status.url, showToken ? status.token : '<token>')}</pre>
          </div>
        )}
        {copied !== null && (
          <p className="settings__hint" role="status">
            {copied}
          </p>
        )}
      </section>

      <section className="settings__group" aria-labelledby="activity-title">
        <h4 id="activity-title" className="settings__group-title">
          {t('activity.title')}
        </h4>
        {activity.length === 0 ? (
          <p className="settings__empty">{t('activity.empty')}</p>
        ) : (
          <ul className="settings__list activity-list">
            {activity.map((entry, index) => (
              // Entries have no id; the list is replaced whole each time it loads.
              // eslint-disable-next-line react/no-array-index-key
              <li key={`${entry.at}-${index}`}>
                <span className="activity-list__actor">{actorName(entry.actor)}</span>
                <span className="activity-list__what">
                  {entry.action.replace('_', ' ')} {entry.detail}
                </span>
                <time dateTime={entry.at}>{formatReceived(entry.at)}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
      {error !== null && (
        <p role="alert" className="settings__error">
          {error}
        </p>
      )}
    </>
  )
}
