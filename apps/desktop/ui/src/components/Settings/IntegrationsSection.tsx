import { isTauri } from '@tauri-apps/api/core'
import { useState } from 'react'
import type { ReactNode } from 'react'

import { importFiles } from '../../api/client'
import type { ImportReport } from '../../api/types'
import { DIRECTIONS, INTEGRATIONS, NOT_WIRED_NOTE } from '../../constants/integrations'
import type { Direction, Integration } from '../../constants/integrations'
import { IconCaret, IconReceive, IconSend, INTEGRATION_GLYPHS } from '../../icons'

const DIRECTION_WORDS: Record<Direction, { title: string; glyph: typeof IconSend }> = {
  receive: { title: 'Receive mail', glyph: IconReceive },
  send: { title: 'Send mail', glyph: IconSend },
}

/** Where mail comes from and how it goes out, in two lists. Each row opens its own connect form; one is open at a time. */
export function IntegrationsSection({ onImported }: { onImported: () => void }): ReactNode {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <>
      <p className="settings__intro">Bring your domains in through Cloudflare or pull an existing mailbox, then pick how replies go out. Each reply leaves from the address the message was sent to.</p>
      {DIRECTIONS.map((direction) => {
        const { title, glyph: Glyph } = DIRECTION_WORDS[direction]
        return (
          <section key={direction} className="settings__group" aria-labelledby={`direction-${direction}`}>
            <h4 id={`direction-${direction}`} className="settings__group-title">
              <Glyph aria-hidden="true" />
              {title}
            </h4>
            <ul className="settings__list">
              {INTEGRATIONS.filter((integration) => integration.directions.includes(direction)).map((integration) => {
                const key = `${direction}-${integration.id}`
                return <IntegrationRow key={key} rowKey={key} integration={integration} open={open === key} onToggle={() => setOpen(open === key ? null : key)} onImported={onImported} />
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
}

function IntegrationRow({ rowKey, integration, open, onToggle, onImported }: RowProps): ReactNode {
  const Glyph = INTEGRATION_GLYPHS[integration.id]
  const panel = `integration-${rowKey}`
  return (
    <li className="integration" data-open={open}>
      <button type="button" className="integration__head" aria-expanded={open} aria-controls={panel} onClick={onToggle}>
        <span className={`integration__glyph logo--${integration.id}`} aria-hidden="true">
          <Glyph />
        </span>
        <span className="integration__words">
          <span className="settings__label">{integration.name}</span>
          <span className="settings__hint">{integration.summary}</span>
        </span>
        <span className="integration__state">{integration.method.kind === 'file' ? 'Ready' : 'Not connected'}</span>
        <IconCaret aria-hidden="true" className="integration__caret" />
      </button>
      {open && (
        <div id={panel} className="integration__panel">
          {integration.method.kind === 'file' ? <FileImport onImported={onImported} /> : <ConnectForm integration={integration} idPrefix={rowKey} />}
        </div>
      )}
    </li>
  )
}

function ConnectForm({ integration, idPrefix }: { integration: Integration; idPrefix: string }): ReactNode {
  const { method } = integration
  return (
    <form className="connect" onSubmit={(event) => event.preventDefault()}>
      {method.kind === 'form' &&
        method.fields.map((field) => {
          const id = `${idPrefix}-${field.id}`
          return (
            <div key={field.id} className="connect__field">
              <label htmlFor={id}>{field.label}</label>
              <input id={id} type={field.type} placeholder={field.placeholder} autoComplete="off" spellCheck={false} aria-describedby={field.hint === undefined ? undefined : `${id}-hint`} />
              {field.hint !== undefined && <small id={`${id}-hint`}>{field.hint}</small>}
            </div>
          )
        })}
      {method.kind === 'oauth' && <p className="connect__note">Opens {method.provider} in your browser to sign in. Buun Mail never sees your password.</p>}
      <div className="connect__actions">
        <button type="submit" className="connect__submit" disabled>
          {method.kind === 'oauth' ? `Sign in with ${method.provider}` : 'Connect'}
        </button>
        <p className="connect__note">{NOT_WIRED_NOTE}</p>
      </div>
    </form>
  )
}

/** Picks .eml and .mbox files and imports them for real, then says what happened. */
function FileImport({ onImported }: { onImported: () => void }): ReactNode {
  const [report, setReport] = useState<ImportReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const available = isTauri()

  const run = (): void => {
    setBusy(true)
    setError(null)
    importFiles()
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
      <p className="connect__note">Messages are filed into workspaces by the address they were delivered to, read from Delivered-To, then X-Original-To, then To. A message imported twice is kept once.</p>
      <div className="connect__actions">
        <button type="button" className="connect__submit" onClick={run} disabled={!available || busy}>
          {busy ? 'Importing' : 'Choose .eml or .mbox files'}
        </button>
        {!available && <p className="connect__note">Importing works in the desktop app.</p>}
      </div>
      {error !== null && (
        <p role="alert" className="settings__error">
          {error}
        </p>
      )}
      {report !== null && (
        <div className="import-report" role="status">
          <p>
            {report.added} added, {report.duplicates} already here{report.failed.length > 0 ? `, ${report.failed.length} could not be read` : ''}.
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
