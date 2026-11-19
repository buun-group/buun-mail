import { isTauri } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { importFiles, listGateways, listSenders } from '../../api/client'
import type { ImportReport } from '../../api/types'
import { DIRECTIONS, INTEGRATIONS, NOT_WIRED_NOTE } from '../../constants/integrations'
import type { Direction, Integration } from '../../constants/integrations'
import { BUUN_GROUP } from '../../constants/products'
import type { Theme } from '../../constants/ui'
import { IconCaret, IconReceive, IconSend, INTEGRATION_GLYPHS } from '../../icons'
import { Gateways } from './Gateways'
import { ResendConnect } from './ResendConnect'

const DIRECTION_WORDS = {
  receive: { title: 'directions.receive', glyph: IconReceive },
  send: { title: 'directions.send', glyph: IconSend },
} as const satisfies Record<Direction, { title: string; glyph: typeof IconSend }>

/** Where mail comes from and how it goes out, in two lists. Each row opens its own connect form; one is open at a time. */
export function IntegrationsSection({ onImported, onSendersChanged, theme }: { onImported: () => void; onSendersChanged: () => void; theme: Theme }): ReactNode {
  const { t } = useTranslation('integrations')
  const [open, setOpen] = useState<string | null>(null)
  const [gatewayCount, setGatewayCount] = useState(0)
  const [senderCount, setSenderCount] = useState(0)
  useEffect(() => {
    listSenders()
      .then((list) => setSenderCount(list.length))
      .catch(() => setSenderCount(0))
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
                return <IntegrationRow key={key} rowKey={key} integration={integration} open={open === key} onToggle={() => setOpen(open === key ? null : key)} onImported={onImported} gatewayCount={gatewayCount} onGatewayCount={setGatewayCount} senderCount={senderCount} onSenderCount={setSenderCount} onSendersChanged={onSendersChanged} theme={theme} />
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
  integration: Integration
  open: boolean
  onToggle: () => void
  onImported: () => void
  gatewayCount: number
  onGatewayCount: (count: number) => void
  senderCount: number
  onSenderCount: (count: number) => void
  onSendersChanged: () => void
  theme: Theme
}

function IntegrationRow({ rowKey, integration, open, onToggle, onImported, gatewayCount, onGatewayCount, senderCount, onSenderCount, onSendersChanged, theme }: RowProps): ReactNode {
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
        <span className="integration__state">{integration.method.kind === 'file' ? t('state.ready') : integration.method.kind === 'gateway' ? (gatewayCount > 0 ? t('state.gateways', { count: gatewayCount }) : t('state.connectHere')) : integration.method.kind === 'resend' ? (senderCount > 0 ? t('state.senders', { count: senderCount }) : t('state.connectHere')) : t('state.notConnected')}</span>
        <IconCaret aria-hidden="true" className="integration__caret" />
      </button>
      {open && (
        <div id={panel} className="integration__panel">
          {integration.method.kind === 'file' ? <FileImport onImported={onImported} /> : integration.method.kind === 'gateway' ? <Gateways onChanged={onImported} onCount={onGatewayCount} /> : integration.method.kind === 'resend' ? <ResendConnect onChanged={onSendersChanged} onCount={onSenderCount} /> : <ConnectForm integration={integration} idPrefix={rowKey} />}
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
