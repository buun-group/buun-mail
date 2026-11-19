import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { addSmtpSender, listSenders } from '../../api/client'
import type { Sender, SmtpSecurity } from '../../api/types'
import { toast } from '../../lib/feedback'
import { Select } from '../Select/Select'
import { MAIL_PRESET_IDS, MAIL_PRESETS } from '../../constants/mailServers'
import type { MailPreset } from '../../constants/mailServers'
import { reason, SenderCard } from './SenderCard'


/** Mail servers connected for sending, and a form to connect another with a preset or its own settings. */
export function SmtpConnect({ onChanged, onCount, preset: initial = 'gmail' }: { onChanged: () => void; onCount: (senders: Sender[]) => void; preset?: MailPreset }): ReactNode {
  const { t } = useTranslation('integrations')
  const [senders, setSenders] = useState<Sender[] | null>(null)
  const [preset, setPreset] = useState<MailPreset>(initial)
  const [host, setHost] = useState<string>(MAIL_PRESETS[initial].smtp.host)
  const [port, setPort] = useState<number>(MAIL_PRESETS[initial].smtp.port)
  const [security, setSecurity] = useState<SmtpSecurity>(MAIL_PRESETS[initial].smtp.security)
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [domains, setDomains] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listSenders()
      .then((list) => {
        setSenders(list)
        onCount(list)
      })
      .catch((cause: unknown) => setError(reason(cause)))
  }, [onCount])

  const show = (list: Sender[]): void => {
    setSenders(list)
    onCount(list)
    onChanged()
  }

  const choose = (id: MailPreset): void => {
    setPreset(id)
    setHost(MAIL_PRESETS[id].smtp.host)
    setPort(MAIL_PRESETS[id].smtp.port)
    setSecurity(MAIL_PRESETS[id].smtp.security)
  }

  const connect = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const typed = domains.split(/[\s,]+/u).filter(Boolean)
    const fallback = username.includes('@') ? [username.split('@')[1] ?? ''] : []
    addSmtpSender(name, { host, port, security, username }, password, typed.length > 0 ? typed : fallback)
      .then((list) => {
        show(list)
        setPassword('')
        setDomains('')
        toast({ text: t('smtp.connected', { host }), tone: 'done' })
      })
      .catch((cause: unknown) => setError(reason(cause)))
      .finally(() => setBusy(false))
  }

  if (senders === null) return null
  return (
    <div className="senders">
      {senders
        .filter((sender) => sender.kind === 'smtp')
        .map((sender) => (
          <SenderCard key={sender.id} sender={sender} onList={show} />
        ))}
      <form className="connect" onSubmit={connect}>
        <h5 className="settings__label">{t('smtp.connectTitle')}</h5>
        <div className="connect__field">
          <label htmlFor="smtp-preset">{t('smtp.preset')}</label>
          <Select id="smtp-preset" className="select--wide" value={preset} options={MAIL_PRESET_IDS.map((id) => ({ value: id, label: t(`smtp.presets.${id}`) }))} onChange={choose} />
          <small>{t(`smtp.hints.${preset}`)}</small>
        </div>
        <div className="connect__row">
          <div className="connect__field">
            <label htmlFor="smtp-host">{t('fields.server')}</label>
            <input id="smtp-host" value={host} placeholder="smtp.example.com" onChange={(event) => setHost(event.target.value)} autoComplete="off" spellCheck={false} required />
          </div>
          <div className="connect__field connect__field--short">
            <label htmlFor="smtp-port">{t('fields.port')}</label>
            <input id="smtp-port" type="number" min={1} max={65535} value={port} onChange={(event) => setPort(Number(event.target.value))} required />
          </div>
        </div>
        <div className="connect__field">
          <label htmlFor="smtp-security">{t('smtp.security')}</label>
          <Select
            id="smtp-security"
            className="select--wide"
            value={security}
            options={[
              { value: 'tls', label: t('smtp.tls') },
              { value: 'startTls', label: t('smtp.startTls') },
              { value: 'none', label: t('smtp.none') },
            ]}
            onChange={(value) => setSecurity(value)}
          />
        </div>
        <div className="connect__field">
          <label htmlFor="smtp-user">{t('fields.username')}</label>
          <input id="smtp-user" value={username} placeholder="you@example.com" onChange={(event) => setUsername(event.target.value)} autoComplete="off" spellCheck={false} />
        </div>
        <div className="connect__field">
          <label htmlFor="smtp-password">{t('smtp.password')}</label>
          <input id="smtp-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="off" />
        </div>
        <div className="connect__field">
          <label htmlFor="smtp-domains">{t('smtp.domains')}</label>
          <input id="smtp-domains" value={domains} placeholder={username.includes('@') ? username.split('@')[1] : 'example.com'} onChange={(event) => setDomains(event.target.value)} autoComplete="off" spellCheck={false} />
          <small>{t('smtp.domainsHint')}</small>
        </div>
        <div className="connect__field">
          <label htmlFor="smtp-name">{t('gateway.nameLabel')}</label>
          <input id="smtp-name" value={name} placeholder={t(`smtp.presets.${preset}`)} onChange={(event) => setName(event.target.value)} autoComplete="off" />
        </div>
        {error !== null && (
          <p role="alert" className="settings__error">
            {error}
          </p>
        )}
        <div className="connect__actions">
          <button type="submit" className="connect__submit" disabled={busy}>
            {busy ? t('smtp.checking') : t('connect')}
          </button>
        </div>
      </form>
    </div>
  )
}
