import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { checkDissolve, connectDissolve, disconnectDissolve, dissolveStatus, setDissolveKeep } from '../../api/client'
import type { DissolveStatus } from '../../api/types'
import { IconRegenerate } from '../../icons'
import { toast } from '../../lib/feedback'
import { formatFull } from '../../lib/time'
import { Confirm } from '../Confirm/Confirm'
import type { Confirmation } from '../Confirm/Confirm'
import { Limits } from '../Dissolve/Limits'
import { reason } from './SenderCard'
import { Switch } from './Switch'
import { BusyButton } from '../Busy/BusyButton'
import { Skeleton } from '../Busy/Skeleton'

/**
 * dissolve.email: Connect opens the browser to approve Buun Mail, then its inboxes become a workspace with a folder each.
 * Connected, it shows the account, whether ended inboxes' mail is kept, Check now, and Disconnect (keeping the mail,
 * or deleting it too after asking).
 */
export function DissolveConnect({ onChanged, onConnected }: { onChanged: () => void; onConnected: (connected: boolean) => void }): ReactNode {
  const { t } = useTranslation('integrations')
  const [status, setStatus] = useState<DissolveStatus | null>(null)
  const [server, setServer] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<Confirmation | null>(null)

  useEffect(() => {
    dissolveStatus()
      .then((found) => {
        setStatus(found)
        setServer(found.server)
      })
      .catch((cause: unknown) => setError(reason(cause)))
  }, [])

  const connect = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    connectDissolve(server)
      .then((next) => {
        setStatus(next)
        onConnected(next.connected)
        onChanged()
        toast({ text: t('dissolve.connected'), ...(next.email === null ? {} : { detail: next.email }), tone: 'done' })
      })
      .catch((cause: unknown) => setError(reason(cause)))
      .finally(() => setBusy(false))
  }

  const disconnect = (deleteMail: boolean): void => {
    void disconnectDissolve(deleteMail).then((next) => {
      setStatus(next)
      onConnected(next.connected)
      onChanged()
      toast({ text: t('dissolve.disconnected'), detail: deleteMail ? t('dissolve.mailDeleted') : t('dissolve.mailKept'), tone: 'done' })
    })
  }

  if (status === null) return <Skeleton label={t('loading')} />
  if (!status.connected) {
    return (
      <form className="connect" onSubmit={connect}>
        <p className="settings__hint">{t('dissolve.intro')}</p>
        <div className="connect__field">
          <label htmlFor="dissolve-server">{t('dissolve.server')}</label>
          <input id="dissolve-server" value={server} onChange={(event) => setServer(event.target.value)} autoComplete="off" spellCheck={false} required />
          <small>{t('dissolve.serverHint')}</small>
        </div>
        {busy && <p className="settings__hint">{t('dissolve.waiting')}</p>}
        {error !== null && (
          <p role="alert" className="settings__error">
            {error}
          </p>
        )}
        <div className="connect__actions">
          <button type="submit" className="connect__submit" disabled={busy}>
            {busy ? t('dissolve.waitingButton') : t('dissolve.connect')}
          </button>
        </div>
      </form>
    )
  }

  return (
    <div className="senders">
      <section className="sender" aria-labelledby="dissolve-account">
        <div className="sender__head">
          <h5 id="dissolve-account" className="settings__label">
            {status.email ?? t('dissolve.account')}
          </h5>
          <span className="settings__mono">{status.plan ?? ''}</span>
        </div>
        <p className="settings__hint">
          {status.lastChecked === null ? t('gateway.neverChecked') : t('gateway.lastChecked', { time: formatFull(status.lastChecked) })} {t('dissolve.inboxes', { count: status.inboxes.filter((inbox) => !inbox.ended).length })}
        </p>
        {status.problem !== null && (
          <p role="alert" className="settings__error">
            {status.problem}
          </p>
        )}
        <Limits limits={status.limits} />
        <div className="settings__row">
          <div>
            <p id="dissolve-keep-label" className="settings__label">
              {t('dissolve.keepTitle')}
            </p>
            <p className="settings__hint">{t('dissolve.keepHint')}</p>
          </div>
          <Switch id="dissolve-keep" labelledBy="dissolve-keep-label" checked={status.keepAfterExpiry} onChange={(keep) => void setDissolveKeep(keep).then(setStatus)} />
        </div>
        <div className="settings__actions settings__actions--tight">
          <BusyButton
            className="settings__button"
            glyph={IconRegenerate}
            busyLabel={t('gateway.checking')}
            run={() =>
              checkDissolve()
                .then(async (arrived) => {
                  toast({ text: t('dissolve.checked'), detail: arrived > 0 ? t('gateway.arrived', { count: arrived }) : t('gateway.nothingNew'), tone: 'done' })
                  onChanged()
                  setStatus(await dissolveStatus())
                })
                .catch((cause: unknown) => {
                  toast({ text: t('dissolve.checkFailed'), detail: reason(cause), tone: 'problem' })
                  throw cause
                })
            }
          >
            {t('gateway.checkNow')}
          </BusyButton>
          <button type="button" className="settings__button" onClick={() => disconnect(false)}>
            {t('dissolve.disconnect')}
          </button>
          <button
            type="button"
            className="settings__button settings__button--danger"
            onClick={() => setConfirming({ title: t('dissolve.deleteTitle'), body: t('dissolve.deleteBody'), action: t('dissolve.deleteAction'), run: () => disconnect(true) })}
          >
            {t('dissolve.disconnectDelete')}
          </button>
        </div>
      </section>
      <Confirm request={confirming} cancelLabel={t('dissolve.cancel')} onClose={() => setConfirming(null)} />
    </div>
  )
}
