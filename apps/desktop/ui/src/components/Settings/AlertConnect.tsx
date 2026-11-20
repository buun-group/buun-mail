import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { addAlert, listAlerts, listSenders, removeAlert, testAlert } from '../../api/client'
import type { AlertChannel, AlertKind } from '../../api/types'
import { IconSend } from '../../icons'
import { toast } from '../../lib/feedback'
import { formatFull } from '../../lib/time'
import { reason } from './SenderCard'
import { SecretField } from './SecretField'

/** The fields each kind asks for: the non-secret ones by name, and what its secret is called. */
type FieldId = 'server' | 'chatId' | 'from' | 'to' | 'accountSid'
type SecretName = 'slackHook' | 'discordHook' | 'ntfyTopic' | 'botToken' | 'webhookUrl' | 'authToken'

const FORMS: Record<AlertKind, { fields: { id: FieldId; sample: string }[]; secret: SecretName | null }> = {
  slack: { fields: [], secret: 'slackHook' },
  discord: { fields: [], secret: 'discordHook' },
  ntfy: { fields: [{ id: 'server', sample: 'https://ntfy.sh' }], secret: 'ntfyTopic' },
  telegram: { fields: [{ id: 'chatId', sample: '123456789' }], secret: 'botToken' },
  webhook: { fields: [], secret: 'webhookUrl' },
  email: { fields: [{ id: 'from', sample: 'alerts@acme.example' }, { id: 'to', sample: 'you@example.com' }], secret: null },
  sms: { fields: [{ id: 'accountSid', sample: 'AC...' }, { id: 'from', sample: '+15550001111' }, { id: 'to', sample: '+15550002222' }], secret: 'authToken' },
}

/**
 * One kind of alert channel: those saved, each with its secret behind the eye, Send a test and Remove, and a form to
 * add one. Rules then pick a channel in Then, Alert me through.
 */
export function AlertConnect({ kind, onCount }: { kind: AlertKind; onCount: (count: number) => void }): ReactNode {
  const { t } = useTranslation('integrations')
  const form = FORMS[kind]
  const [channels, setChannels] = useState<AlertChannel[] | null>(null)
  const [name, setName] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [secret, setSecret] = useState('')
  const [senderAddresses, setSenderAddresses] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const mine = (list: AlertChannel[]): AlertChannel[] => list.filter((channel) => channel.kind === kind)
  const take = (list: AlertChannel[]): void => {
    setChannels(mine(list))
    onCount(mine(list).length)
  }

  useEffect(() => {
    listAlerts()
      .then((list) => {
        setChannels(list.filter((channel) => channel.kind === kind))
        onCount(list.filter((channel) => channel.kind === kind).length)
      })
      .catch((cause: unknown) => setError(reason(cause)))
    if (kind === 'email') void listSenders().then((senders) => setSenderAddresses(senders.flatMap((sender) => sender.domains.filter((domain) => domain.status === 'verified').map((domain) => `alerts@${domain.name}`))))
  }, [kind, onCount])

  const add = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    setError(null)
    addAlert({ name, kind, fields, secret })
      .then((list) => {
        take(list)
        setName('')
        setFields({})
        setSecret('')
        toast({ text: t('alerts.added'), detail: t('alerts.addedDetail'), tone: 'done' })
      })
      .catch((cause: unknown) => setError(reason(cause)))
  }

  if (channels === null) return null
  return (
    <div className="senders">
      {channels.map((channel) => (
        <section key={channel.id} className="sender" aria-labelledby={`alert-${channel.id}`}>
          <div className="sender__head">
            <h5 id={`alert-${channel.id}`} className="settings__label">
              {channel.name}
            </h5>
            <span className="settings__mono">{Object.values(channel.fields).filter((value) => !value.startsWith('http://127') && !value.startsWith('http://localhost')).join('  ')}</span>
          </div>
          <p className="settings__hint">{channel.lastSent === null ? t('alerts.neverSent') : t('alerts.lastSent', { time: formatFull(channel.lastSent), count: channel.sent })}</p>
          {channel.problem !== null && (
            <p role="alert" className="settings__error">
              {channel.problem}
            </p>
          )}
          {channel.hasSecret && form.secret !== null && <SecretField kind="alert" id={channel.id} label={t(`alerts.secret.${form.secret}`)} />}
          <div className="settings__actions settings__actions--tight">
            <button
              type="button"
              className="settings__button"
              onClick={() =>
                void testAlert(channel.id)
                  .then(() => toast({ text: t('alerts.tested'), detail: channel.name, tone: 'done', glyph: IconSend }))
                  .catch((cause: unknown) => toast({ text: t('alerts.testFailed'), detail: reason(cause), tone: 'problem' }))
                  .finally(() => void listAlerts().then(take))
              }
            >
              <IconSend aria-hidden="true" />
              {t('alerts.test')}
            </button>
            <button type="button" className="settings__button settings__button--danger" onClick={() => void removeAlert(channel.id).then(take)}>
              {t('resend.remove')}
            </button>
          </div>
        </section>
      ))}
      <form className="connect" onSubmit={add}>
        <h5 className="settings__label">{t('alerts.addTitle')}</h5>
        <p className="settings__hint">{t(`alerts.hints.${kind}`)}</p>
        <div className="connect__field">
          <label htmlFor={`alert-name-${kind}`}>{t('gateway.nameLabel')}</label>
          <input id={`alert-name-${kind}`} value={name} placeholder={t('alerts.namePlaceholder')} onChange={(event) => setName(event.target.value)} autoComplete="off" />
        </div>
        {form.fields.map((field) => (
          <div key={field.id} className="connect__field">
            <label htmlFor={`alert-${kind}-${field.id}`}>{t(`alerts.fields.${field.id}`)}</label>
            <input
              id={`alert-${kind}-${field.id}`}
              value={fields[field.id] ?? ''}
              placeholder={kind === 'email' && field.id === 'from' && senderAddresses[0] !== undefined ? senderAddresses[0] : field.sample}
              onChange={(event) => setFields({ ...fields, [field.id]: event.target.value })}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        ))}
        {form.secret !== null && (
          <div className="connect__field">
            <label htmlFor={`alert-${kind}-secret`}>{t(`alerts.secret.${form.secret}`)}</label>
            <input id={`alert-${kind}-secret`} type="password" value={secret} onChange={(event) => setSecret(event.target.value)} autoComplete="off" spellCheck={false} />
            <small>{t('alerts.secretHint')}</small>
          </div>
        )}
        {error !== null && (
          <p role="alert" className="settings__error">
            {error}
          </p>
        )}
        <div className="connect__actions">
          <button type="submit" className="connect__submit">
            {t('alerts.add')}
          </button>
        </div>
      </form>
    </div>
  )
}
