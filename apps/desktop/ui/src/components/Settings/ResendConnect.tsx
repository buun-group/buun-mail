import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { addResendSender, listSenders } from '../../api/client'
import type { Sender } from '../../api/types'
import { toast } from '../../lib/feedback'
import { reason, SenderCard } from './SenderCard'

/**
 * Resend: each connected key with its domains and their state, its signature, Refresh and Remove; and a form to connect
 * another. A full-access key brings its domains; a sending-only key needs them typed.
 */
export function ResendConnect({ onChanged, onCount }: { onChanged: () => void; onCount: (senders: Sender[]) => void }): ReactNode {
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
      onCount(list)
      onChanged()
    },
    [onChanged, onCount],
  )

  useEffect(() => {
    listSenders()
      .then((list) => {
        setSenders(list)
        onCount(list)
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
      {senders.filter((sender) => sender.kind === 'resend').map((sender) => (
        <SenderCard key={sender.id} sender={sender} onList={show} />
      ))}
      <form className="connect" onSubmit={connect}>
        <h5 className="settings__label">{senders.some((sender) => sender.kind === 'resend') ? t('resend.connectAnother') : t('resend.connectTitle')}</h5>
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
            <input id="resend-domains" value={domains} placeholder="acme.example, globex.example" onChange={(event) => setDomains(event.target.value)} autoComplete="off" spellCheck={false} />
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
