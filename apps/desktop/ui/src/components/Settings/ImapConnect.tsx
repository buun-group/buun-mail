import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { addImapAccount, checkImapAccounts, listImapAccounts, removeImapAccount } from '../../api/client'
import type { ImapAccount, SmtpSecurity } from '../../api/types'
import { MAIL_PRESET_IDS, MAIL_PRESETS } from '../../constants/mailServers'
import type { MailPreset } from '../../constants/mailServers'
import { IconRegenerate } from '../../icons'
import { toast } from '../../lib/feedback'
import { formatFull } from '../../lib/time'
import { Select } from '../Select/Select'
import { SecretField } from './SecretField'
import { reason } from './SenderCard'
import { BusyButton } from '../Busy/BusyButton'
import { Skeleton } from '../Busy/Skeleton'

/**
 * Mailboxes collected over IMAP, each with how its checks are going, Check now and Remove; and a form to add one with a
 * provider's preset or its own server. Mail is collected every two minutes and never marked read on the server.
 */
export function ImapConnect({ preset: initial, onChanged }: { preset: MailPreset; onChanged: () => void }): ReactNode {
  const { t } = useTranslation('integrations')
  const [accounts, setAccounts] = useState<ImapAccount[] | null>(null)
  const [preset, setPreset] = useState<MailPreset>(initial)
  const [host, setHost] = useState<string>(MAIL_PRESETS[initial].imap.host)
  const [port, setPort] = useState<number>(MAIL_PRESETS[initial].imap.port)
  const [security, setSecurity] = useState<SmtpSecurity>(MAIL_PRESETS[initial].imap.security)
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [folder, setFolder] = useState('INBOX')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listImapAccounts()
      .then(setAccounts)
      .catch((cause: unknown) => setError(reason(cause)))
  }, [])

  const choose = (id: MailPreset): void => {
    setPreset(id)
    setHost(MAIL_PRESETS[id].imap.host)
    setPort(MAIL_PRESETS[id].imap.port)
    setSecurity(MAIL_PRESETS[id].imap.security)
  }

  const add = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    addImapAccount({ name, host, port, security, username, password, folder })
      .then((list) => {
        setAccounts(list)
        setPassword('')
        onChanged()
        toast({ text: t('imap.connected', { name: name || username }), detail: t('imap.firstTake'), tone: 'done' })
      })
      .catch((cause: unknown) => setError(reason(cause)))
      .finally(() => setBusy(false))
  }

  if (accounts === null) return <Skeleton label={t('loading')} />
  return (
    <div className="senders">
      {accounts.map((account) => (
        <section key={account.id} className="sender" aria-labelledby={`imap-${account.id}`}>
          <div className="sender__head">
            <h5 id={`imap-${account.id}`} className="settings__label">
              {account.name}
            </h5>
            <span className="settings__mono">
              {account.username} @ {account.host}:{account.port}
            </span>
          </div>
          <SecretField kind="imap" id={account.id} label={t('secrets.password')} />
          <p className="settings__hint">
            {account.lastChecked === null ? t('gateway.neverChecked') : t('gateway.lastChecked', { time: formatFull(account.lastChecked) })} {t('gateway.received', { count: account.received })}
          </p>
          {account.problem !== null && (
            <p role="alert" className="settings__error">
              {account.problem}
            </p>
          )}
          <div className="settings__actions settings__actions--tight">
            <BusyButton
              className="settings__button"
              glyph={IconRegenerate}
              busyLabel={t('gateway.checking')}
              run={() =>
                checkImapAccounts()
                  .then((arrived) => {
                    toast({ text: t('imap.checked'), detail: arrived > 0 ? t('gateway.arrived', { count: arrived }) : t('gateway.nothingNew'), tone: 'done' })
                    onChanged()
                    return listImapAccounts().then(setAccounts)
                  })
                  .catch((cause: unknown) => toast({ text: t('imap.checkFailed'), detail: reason(cause), tone: 'problem' }))
              }
            >
              {t('gateway.checkNow')}
            </BusyButton>
            <button
              type="button"
              className="settings__button settings__button--danger"
              onClick={() =>
                void removeImapAccount(account.id).then((list) => {
                  setAccounts(list)
                  toast({ text: t('resend.removed', { name: account.name }), detail: t('gateway.removedDetail'), tone: 'done' })
                })
              }
            >
              {t('resend.remove')}
            </button>
          </div>
        </section>
      ))}
      <form className="connect" onSubmit={add}>
        <h5 className="settings__label">{t('imap.connectTitle')}</h5>
        <div className="connect__field">
          <label htmlFor="imap-preset">{t('smtp.preset')}</label>
          <Select id="imap-preset" className="select--wide" value={preset} options={MAIL_PRESET_IDS.map((id) => ({ value: id, label: t(`smtp.presets.${id}`) }))} onChange={choose} />
          <small>{t(`imap.hints.${preset}`)}</small>
        </div>
        <div className="connect__row">
          <div className="connect__field">
            <label htmlFor="imap-host">{t('fields.server')}</label>
            <input id="imap-host" value={host} placeholder="imap.example.com" onChange={(event) => setHost(event.target.value)} autoComplete="off" spellCheck={false} required />
          </div>
          <div className="connect__field connect__field--short">
            <label htmlFor="imap-port">{t('fields.port')}</label>
            <input id="imap-port" type="number" min={1} max={65535} value={port} onChange={(event) => setPort(Number(event.target.value))} required />
          </div>
        </div>
        <div className="connect__field">
          <label htmlFor="imap-security">{t('smtp.security')}</label>
          <Select
            id="imap-security"
            className="select--wide"
            value={security}
            options={[
              { value: 'tls', label: t('imap.tls') },
              { value: 'startTls', label: t('imap.startTls') },
              { value: 'none', label: t('smtp.none') },
            ]}
            onChange={(value) => setSecurity(value)}
          />
        </div>
        <div className="connect__field">
          <label htmlFor="imap-user">{t('fields.username')}</label>
          <input id="imap-user" value={username} placeholder="you@gmail.com" onChange={(event) => setUsername(event.target.value)} autoComplete="off" spellCheck={false} required />
        </div>
        <div className="connect__field">
          <label htmlFor="imap-password">{t('smtp.password')}</label>
          <input id="imap-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="off" required />
        </div>
        <div className="connect__row">
          <div className="connect__field">
            <label htmlFor="imap-name">{t('gateway.nameLabel')}</label>
            <input id="imap-name" value={name} placeholder={t(`smtp.presets.${preset}`)} onChange={(event) => setName(event.target.value)} autoComplete="off" />
          </div>
          <div className="connect__field">
            <label htmlFor="imap-folder">{t('imap.folder')}</label>
            <input id="imap-folder" value={folder} onChange={(event) => setFolder(event.target.value)} autoComplete="off" spellCheck={false} />
          </div>
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
