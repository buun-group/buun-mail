import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { addResendSender, listSenders, refreshSenders, removeSender, updateSender } from '../../api/client'
import type { Sender, SenderDomain } from '../../api/types'
import { IconDone, IconInfo, IconProblem, IconRegenerate } from '../../icons'
import { toast } from '../../lib/feedback'

const reason = (error: unknown): string => (error instanceof Error ? error.message : typeof error === 'string' ? error : String(error))

/** A domain's state as a glyph and words: ready to send, waiting on DNS, or failed. */
function DomainState({ domain }: { domain: SenderDomain }): ReactNode {
  const { t } = useTranslation('integrations')
  const ready = domain.status === 'verified' || domain.status === 'entered'
  const failed = domain.status === 'failed' || domain.status === 'temporary_failure'
  const Glyph = ready ? IconDone : failed ? IconProblem : IconInfo
  return (
    <span className="sender-domain__state" data-tone={ready ? 'done' : failed ? 'problem' : 'info'}>
      <Glyph aria-hidden="true" />
      {ready ? t('resend.ready') : failed ? t('resend.failed') : t('resend.pending')}
    </span>
  )
}

/**
 * Resend: each connected key with its domains and their state, its signature, Refresh and Remove; and a form to connect
 * another. A full-access key brings its domains; a sending-only key needs them typed.
 */
export function ResendConnect({ onChanged, onCount }: { onChanged: () => void; onCount: (count: number) => void }): ReactNode {
  const { t } = useTranslation('integrations')
  const [senders, setSenders] = useState<Sender[] | null>(null)
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [domains, setDomains] = useState('')
  const [needsDomains, setNeedsDomains] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const show = useCallback(
    (list: Sender[]) => {
      setSenders(list)
      onCount(list.length)
      onChanged()
    },
    [onChanged, onCount],
  )

  useEffect(() => {
    listSenders()
      .then((list) => {
        setSenders(list)
        onCount(list.length)
      })
      .catch((cause: unknown) => setError(reason(cause)))
  }, [onCount])

  const connect = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const typed = domains.split(/[\s,]+/u).filter(Boolean)
    addResendSender(name, key, typed)
      .then((list) => {
        show(list)
        setName('')
        setKey('')
        setDomains('')
        setNeedsDomains(false)
        toast({ text: t('resend.connected'), tone: 'done' })
      })
      .catch((cause: unknown) => {
        const said = reason(cause)
        if (said.includes('may only send')) setNeedsDomains(true)
        setError(said)
      })
      .finally(() => setBusy(false))
  }

  if (senders === null) return null

  return (
    <div className="senders">
      {senders.map((sender) => (
        <section key={sender.id} className="sender" aria-labelledby={`sender-${sender.id}`}>
          <div className="sender__head">
            <h5 id={`sender-${sender.id}`} className="settings__label">
              {sender.name}
            </h5>
            <span className="settings__mono">{t('resend.keyEnding', { hint: sender.keyHint })}</span>
          </div>
          <ul className="sender__domains" aria-label={t('resend.domains')}>
            {sender.domains.map((domain) => (
              <li key={domain.name} className="sender-domain">
                <span className="settings__mono">{domain.name}</span>
                <DomainState domain={domain} />
              </li>
            ))}
            {sender.domains.length === 0 && <li className="settings__hint">{t('resend.noDomains')}</li>}
          </ul>
          <div className="connect__field">
            <label htmlFor={`signature-${sender.id}`}>{t('resend.signature')}</label>
            <textarea
              id={`signature-${sender.id}`}
              defaultValue={sender.signature}
              rows={3}
              placeholder={t('resend.signaturePlaceholder')}
              onBlur={(event) => {
                if (event.target.value === sender.signature) return
                void updateSender(sender.id, { signature: event.target.value }).then((list) => {
                  show(list)
                  toast({ text: t('resend.signatureSaved'), tone: 'done' })
                })
              }}
            />
          </div>
          <div className="settings__actions settings__actions--tight">
            {!sender.restricted && (
              <button
                type="button"
                className="settings__button"
                onClick={() =>
                  void refreshSenders()
                    .then((list) => {
                      show(list)
                      toast({ text: t('resend.refreshed'), tone: 'done' })
                    })
                    .catch((cause: unknown) => toast({ text: t('resend.refreshFailed'), detail: reason(cause), tone: 'problem' }))
                }
              >
                <IconRegenerate aria-hidden="true" />
                {t('resend.refresh')}
              </button>
            )}
            <button
              type="button"
              className="settings__button settings__button--danger"
              onClick={() =>
                void removeSender(sender.id).then((list) => {
                  show(list)
                  toast({ text: t('resend.removed', { name: sender.name }), tone: 'done' })
                })
              }
            >
              {t('resend.remove')}
            </button>
          </div>
        </section>
      ))}
      <form className="connect" onSubmit={connect}>
        <h5 className="settings__label">{senders.length === 0 ? t('resend.connectTitle') : t('resend.connectAnother')}</h5>
        <p className="settings__hint">{t('resend.hint')}</p>
        <div className="connect__field">
          <label htmlFor="resend-name">{t('gateway.nameLabel')}</label>
          <input id="resend-name" value={name} placeholder="Resend" onChange={(event) => setName(event.target.value)} autoComplete="off" />
        </div>
        <div className="connect__field">
          <label htmlFor="resend-key">{t('fields.apiKey')}</label>
          <input id="resend-key" type="password" value={key} placeholder="re_..." onChange={(event) => setKey(event.target.value)} autoComplete="off" spellCheck={false} required />
          <small>{t('fields.resendKeyHint')}</small>
        </div>
        {needsDomains && (
          <div className="connect__field">
            <label htmlFor="resend-domains">{t('resend.domainsLabel')}</label>
            <input id="resend-domains" value={domains} placeholder="flung.dev, buungroup.com" onChange={(event) => setDomains(event.target.value)} autoComplete="off" spellCheck={false} />
            <small>{t('resend.domainsHint')}</small>
          </div>
        )}
        {error !== null && (
          <p role="alert" className="settings__error">
            {error}
          </p>
        )}
        <div className="connect__actions">
          <button type="submit" className="connect__submit" disabled={busy}>
            {busy ? t('gateway.connecting') : t('connect')}
          </button>
        </div>
      </form>
    </div>
  )
}
