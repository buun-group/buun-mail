import { isTauri } from '@tauri-apps/api/core'
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { importFiles, dissolveStatus, listGateways, listSenders } from '../../api/client'
import type { ImportReport, Sender } from '../../api/types'
import { DIRECTIONS, INTEGRATIONS, NOT_WIRED_NOTE } from '../../constants/integrations'
import type { Direction, Integration } from '../../constants/integrations'
import { BUUN_GROUP } from '../../constants/products'
import type { Theme } from '../../constants/ui'
import { IconCaret, IconReceive, IconSend, INTEGRATION_GLYPHS, IconBellRinging } from '../../icons'
import { Gateways } from './Gateways'
import { ResendConnect } from './ResendConnect'
import { AlertConnect } from './AlertConnect'
import { DissolveConnect } from './DissolveConnect'
import { ImapConnect } from './ImapConnect'
import { SmtpConnect } from './SmtpConnect'

const DIRECTION_WORDS = {
  receive: { title: 'directions.receive', glyph: IconReceive },
  send: { title: 'directions.send', glyph: IconSend },
  alert: { title: 'directions.alert', glyph: IconBellRinging },
} as const satisfies Record<Direction, { title: string; glyph: typeof IconSend }>

/** Where mail comes from and how it goes out, in two lists. Each row opens its own connect form; one is open at a time. */
export function IntegrationsSection({ onImported, onSendersChanged, theme }: { onImported: () => void; onSendersChanged: () => void; theme: Theme }): ReactNode {
  const { t } = useTranslation('integrations')
  const [open, setOpen] = useState<string | null>(null)
  const [gatewayCount, setGatewayCount] = useState(0)
  const [senders, setSenders] = useState<Sender[]>([])
  const [dissolveConnected, setDissolveConnected] = useState(false)
  const [alertCounts, setAlertCounts] = useState<Record<string, number>>({})
  const onAlertCount = useCallback((id: string, count: number) => setAlertCounts((counts) => (counts[id] === count ? counts : { ...counts, [id]: count })), [])
  useEffect(() => {
    dissolveStatus()
      .then((status) => setDissolveConnected(status.connected))
      .catch(() => setDissolveConnected(false))
  }, [])
  useEffect(() => {
    listSenders()
      .then(setSenders)
      .catch(() => setSenders([]))
  }, [])
  useEffect(() => {
    listGateways()
      .then((list) => setGatewayCount(list.length))
      .catch(() => setGatewayCount(0))
  }, [])
  return (
    <>
      <p className="settings__intro">{t('intro')}</p>
      {DIRECTIONS.map((direction) => {
        const { title, glyph: Glyph } = DIRECTION_WORDS[direction]
        return (
          <section key={direction} className="settings__group" aria-labelledby={`direction-${direction}`}>
            <h4 id={`direction-${direction}`} className="settings__group-title">
              <Glyph aria-hidden="true" />
              {t(title)}
            </h4>
            <ul className="settings__list">
              {INTEGRATIONS.filter((integration) => integration.directions.includes(direction)).map((integration) => {
                const key = `${direction}-${integration.id}`
                return <IntegrationRow key={key} rowKey={key} direction={direction} integration={integration} open={open === key} onToggle={() => setOpen(open === key ? null : key)} onImported={onImported} gatewayCount={gatewayCount} onGatewayCount={setGatewayCount} senders={senders} onSenders={setSenders} onSendersChanged={onSendersChanged} theme={theme} dissolveConnected={dissolveConnected} onDissolveConnected={setDissolveConnected} alertCounts={alertCounts} onAlertCount={onAlertCount} />
              })}
            </ul>
          </section>
        )
      })}
    </>
  )
}

interface RowProps {
  rowKey: string
  /** Which list the row is in: reading mail, or sending it. */
  direction: Direction
  integration: Integration
  open: boolean
  onToggle: () => void
  onImported: () => void
  gatewayCount: number
  /** Whether a dissolve.email account is signed in, for its row's state. */
  dissolveConnected: boolean
  onDissolveConnected: (connected: boolean) => void
  /** Saved alert channels per row, for each row's state. */
  alertCounts: Record<string, number>
  onAlertCount: (id: string, count: number) => void
  onGatewayCount: (count: number) => void
  senders: Sender[]
  onSenders: (senders: Sender[]) => void
  onSendersChanged: () => void
  theme: Theme
}

/** How many senders of one kind are connected. */
const senderCountOf = (senders: Sender[], kind: 'resend' | 'smtp'): number => senders.filter((sender) => sender.kind === kind).length

function IntegrationRow({ rowKey, direction, integration, open, onToggle, onImported, gatewayCount, onGatewayCount, senders, onSenders, onSendersChanged, theme, dissolveConnected, onDissolveConnected, alertCounts, onAlertCount }: RowProps): ReactNode {
  const { t } = useTranslation('integrations')
  const Glyph = INTEGRATION_GLYPHS[integration.id]
  const panel = `integration-${rowKey}`
  return (
    <li className="integration" data-open={open}>
      <button type="button" className="integration__head" aria-expanded={open} aria-controls={panel} onClick={onToggle}>
        <span className={`integration__glyph logo--${integration.id}`} aria-hidden="true">
          {integration.id === 'gateway' ? <img src={BUUN_GROUP.logo[theme]} alt="" /> : <Glyph />}
        </span>
        <span className="integration__words">
          <span className="settings__label">{t(integration.name)}</span>
          <span className="settings__hint">{t(integration.summary)}</span>
        </span>
        <span className="integration__state">{integration.method.kind === 'file' ? t('state.ready') : integration.method.kind === 'gateway' ? (gatewayCount > 0 ? t('state.gateways', { count: gatewayCount }) : t('state.connectHere')) : integration.method.kind === 'alert' ? ((alertCounts[integration.id] ?? 0) > 0 ? t('state.alerts', { count: alertCounts[integration.id] ?? 0 }) : t('state.connectHere')) : integration.method.kind === 'dissolve' ? (dissolveConnected ? t('state.connected') : t('state.connectHere')) : integration.method.kind === 'mailbox' ? t('state.connectHere') : integration.method.kind === 'resend' || integration.method.kind === 'smtp' ? (senderCountOf(senders, integration.method.kind) > 0 ? t('state.senders', { count: senderCountOf(senders, integration.method.kind) }) : t('state.connectHere')) : t('state.notConnected')}</span>
        <IconCaret aria-hidden="true" className="integration__caret" />
      </button>
      {open && (
        <div id={panel} className="integration__panel">
          {integration.method.kind === 'file' ? <FileImport onImported={onImported} /> : integration.method.kind === 'gateway' ? <Gateways onChanged={onImported} onCount={onGatewayCount} /> : integration.method.kind === 'resend' ? <ResendConnect onChanged={onSendersChanged} onCount={onSenders} /> : integration.method.kind === 'smtp' ? <SmtpConnect onChanged={onSendersChanged} onCount={onSenders} /> : integration.method.kind === 'alert' ? <AlertConnect kind={integration.method.alert} onCount={(count) => onAlertCount(integration.id, count)} /> : integration.method.kind === 'dissolve' ? <DissolveConnect onChanged={onImported} onConnected={onDissolveConnected} /> : integration.method.kind === 'mailbox' ? direction === 'receive' ? <ImapConnect preset={integration.method.preset} onChanged={onImported} /> : <SmtpConnect preset={integration.method.preset} onChanged={onSendersChanged} onCount={onSenders} /> : <ConnectForm integration={integration} idPrefix={rowKey} />}
        </div>
      )}
    </li>
  )
}

function ConnectForm({ integration, idPrefix }: { integration: Integration; idPrefix: string }): ReactNode {
  const { t } = useTranslation('integrations')
  const { method } = integration
  return (
    <form className="connect" onSubmit={(event) => event.preventDefault()}>
      {method.kind === 'form' &&
        method.fields.map((field) => {
          const id = `${idPrefix}-${field.id}`
          return (
            <div key={field.id} className="connect__field">
              <label htmlFor={id}>{t(field.label)}</label>
              <input id={id} type={field.type} placeholder={field.placeholder === undefined ? field.sample : t(field.placeholder)} autoComplete="off" spellCheck={false} aria-describedby={field.hint === undefined ? undefined : `${id}-hint`} />
              {field.hint !== undefined && <small id={`${id}-hint`}>{t(field.hint)}</small>}
            </div>
          )
        })}
      {method.kind === 'oauth' && <p className="connect__note">{t('oauthNote', { provider: method.provider })}</p>}
      <div className="connect__actions">
        <button type="submit" className="connect__submit" disabled>
          {method.kind === 'oauth' ? t('signIn', { provider: method.provider }) : t('connect')}
        </button>
        <p className="connect__note">{t(NOT_WIRED_NOTE)}</p>
      </div>
    </form>
  )
}

/** Picks .eml and .mbox files and imports them for real, then says what happened. */
function FileImport({ onImported }: { onImported: () => void }): ReactNode {
  const { t } = useTranslation('integrations')
  const [report, setReport] = useState<ImportReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const available = isTauri()

  const run = (): void => {
    setBusy(true)
    setError(null)
    importFiles(t('file.filterName'))
      .then((result) => {
        if (result === null) return
        setReport(result)
        if (result.added > 0) onImported()
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setBusy(false))
  }

  return (
    <div className="connect">
      <p className="connect__note">{t('file.note')}</p>
      <div className="connect__actions">
        <button type="button" className="connect__submit" onClick={run} disabled={!available || busy}>
          {busy ? t('file.importing') : t('file.choose')}
        </button>
        {!available && <p className="connect__note">{t('file.desktopOnly')}</p>}
      </div>
      {error !== null && (
        <p role="alert" className="settings__error">
          {error}
        </p>
      )}
      {report !== null && (
        <div className="import-report" role="status">
          <p>
            {report.failed.length > 0 ? t('file.reportFailed', { added: report.added, duplicates: report.duplicates, failed: report.failed.length }) : t('file.report', { added: report.added, duplicates: report.duplicates })}
          </p>
          {report.failed.length > 0 && (
            <ul>
              {report.failed.map((failure) => (
                <li key={failure.source}>
                  <code>{failure.source}</code> {failure.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
