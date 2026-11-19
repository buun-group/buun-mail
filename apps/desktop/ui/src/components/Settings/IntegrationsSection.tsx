import { useState } from 'react'
import type { ReactNode } from 'react'

import { INTEGRATIONS, NOT_WIRED_NOTE } from '../../constants/integrations'
import type { Integration, IntegrationId } from '../../constants/integrations'
import { IconCaret, INTEGRATION_GLYPHS } from '../../icons'

/** Where mail comes from. Each row opens its own connect form; one is open at a time. */
export function IntegrationsSection(): ReactNode {
  const [open, setOpen] = useState<IntegrationId | null>(null)
  return (
    <>
      <p className="settings__intro">Bring your domains in through Cloudflare, or pull an existing mailbox. Everything lands in the workspaces your routing file defines.</p>
      <ul className="settings__list">
        {INTEGRATIONS.map((integration) => (
          <IntegrationRow key={integration.id} integration={integration} open={open === integration.id} onToggle={() => setOpen(open === integration.id ? null : integration.id)} />
        ))}
      </ul>
    </>
  )
}

function IntegrationRow({ integration, open, onToggle }: { integration: Integration; open: boolean; onToggle: () => void }): ReactNode {
  const Glyph = INTEGRATION_GLYPHS[integration.id]
  const panel = `integration-${integration.id}`
  return (
    <li className="integration" data-open={open}>
      <button type="button" className="integration__head" aria-expanded={open} aria-controls={panel} onClick={onToggle}>
        <span className="integration__glyph" aria-hidden="true">
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
          <ConnectForm integration={integration} />
        </div>
      )}
    </li>
  )
}

function ConnectForm({ integration }: { integration: Integration }): ReactNode {
  const [picked, setPicked] = useState<string | null>(null)
  const { method } = integration
  return (
    <form className="connect" onSubmit={(event) => event.preventDefault()}>
      {method.kind === 'form' &&
        method.fields.map((field) => {
          const id = `${integration.id}-${field.id}`
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
            id={`${integration.id}-file`}
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
