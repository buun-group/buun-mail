import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { SecretField } from './SecretField'

import { refreshSenders, removeSender, updateSender } from '../../api/client'
import type { Sender, SenderDomain } from '../../api/types'
import { IconDone, IconInfo, IconProblem, IconRegenerate } from '../../icons'
import { toast } from '../../lib/feedback'
import { BusyButton } from '../Busy/BusyButton'

/** A refusal in words, whether it came as an Error or a plain string from the Rust side. */
export const reason = (error: unknown): string => (error instanceof Error ? error.message : typeof error === 'string' ? error : String(error))

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
 * One connected sender, Resend key or mail server: what it is, its domains and their state, its signature (saved on
 * leaving the field), Refresh domains for a Resend key that lists them, and Remove.
 */
export function SenderCard({ sender, onList }: { sender: Sender; onList: (senders: Sender[]) => void }): ReactNode {
  const { t } = useTranslation('integrations')
  const what = sender.kind === 'smtp' && sender.smtp !== null ? `${sender.smtp.username} @ ${sender.smtp.host}:${sender.smtp.port}` : t('resend.keyEnding', { hint: sender.keyHint })
  return (
    <section className="sender" aria-labelledby={`sender-${sender.id}`}>
      <div className="sender__head">
        <h5 id={`sender-${sender.id}`} className="settings__label">
          {sender.name}
        </h5>
        <span className="settings__mono">{what}</span>
      </div>
      <SecretField kind="sender" id={sender.id} label={sender.kind === 'smtp' ? t('secrets.password') : t('secrets.apiKey')} />
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
              onList(list)
              toast({ text: t('resend.signatureSaved'), tone: 'done' })
            })
          }}
        />
      </div>
      <div className="settings__actions settings__actions--tight">
        {sender.kind === 'resend' && !sender.restricted && (
          <BusyButton
            className="settings__button"
            glyph={IconRegenerate}
            busyLabel={t('resend.refreshing')}
            run={() =>
              refreshSenders()
                .then((list) => {
                  onList(list)
                  toast({ text: t('resend.refreshed'), tone: 'done' })
                })
                .catch((cause: unknown) => {
                  toast({ text: t('resend.refreshFailed'), detail: reason(cause), tone: 'problem' })
                  throw cause
                })
            }
          >
            {t('resend.refresh')}
          </BusyButton>
        )}
        <button
          type="button"
          className="settings__button settings__button--danger"
          onClick={() =>
            void removeSender(sender.id).then((list) => {
              onList(list)
              toast({ text: t('resend.removed', { name: sender.name }), tone: 'done' })
            })
          }
        >
          {t('resend.remove')}
        </button>
      </div>
    </section>
  )
}
