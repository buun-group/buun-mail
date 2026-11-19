import { useState } from 'react'
import type { ReactNode } from 'react'

import { DIRECTIONS, INTEGRATIONS, NOT_WIRED_NOTE } from '../../constants/integrations'
import type { Direction, Integration } from '../../constants/integrations'
import { IconCaret, IconReceive, IconSend, INTEGRATION_GLYPHS } from '../../icons'

const DIRECTION_WORDS: Record<Direction, { title: string; glyph: typeof IconSend }> = {
  receive: { title: 'Receive mail', glyph: IconReceive },
  send: { title: 'Send mail', glyph: IconSend },
}

/** Where mail comes from and how it goes out, in two lists. Each row opens its own connect form; one is open at a time. */
export function IntegrationsSection(): ReactNode {
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
                return <IntegrationRow key={key} rowKey={key} integration={integration} open={open === key} onToggle={() => setOpen(open === key ? null : key)} />
              })}
            </ul>
          </section>
        )
      })}
    </>
  )
}

function IntegrationRow({ rowKey, integration, open, onToggle }: { rowKey: string; integration: Integration; open: boolean; onToggle: () => void }): ReactNode {
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
        <span className="integration__state">Not connected</span>
        <IconCaret aria-hidden="true" className="integration__caret" />
      </button>
      {open && (
        <div id={panel} className="integration__panel">
          <ConnectForm integration={integration} idPrefix={rowKey} />
        </div>
      )}
    </li>
  )
}

function ConnectForm({ integration, idPrefix }: { integration: Integration; idPrefix: string }): ReactNode {
  const [picked, setPicked] = useState<string | null>(null)
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
      {method.kind === 'file' && (
        <label className="connect__drop">
          <input
            id={`${idPrefix}-file`}
            type="file"
            accept={method.accept}
            multiple
            onChange={(event) => {
              const files = [...(event.target.files ?? [])]
              setPicked(files.length === 0 ? null : `${files.length} ${files.length === 1 ? 'file' : 'files'} picked`)
            }}
          />
          <span>{picked ?? 'Choose .eml or .mbox files'}</span>
        </label>
      )}
      <div className="connect__actions">
        <button type="submit" className="connect__submit" disabled>
          {method.kind === 'oauth' ? `Sign in with ${method.provider}` : method.kind === 'file' ? 'Import' : 'Connect'}
        </button>
        <p className="connect__note">{NOT_WIRED_NOTE}</p>
      </div>
    </form>
  )
}
