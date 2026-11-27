import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { connectCryptflare, cryptflareEnvironments, cryptflareStatus, cryptflareWorkspaces, disconnectCryptflare, flushCryptflare, saveIdentitiesToCryptflare, setCryptflareSaveIdentities, setCryptflareTarget } from '../../api/client'
import type { CryptFlareChoice, CryptFlareStatus } from '../../api/types'
import { IconIdentity, IconRegenerate } from '../../icons'
import { toast } from '../../lib/feedback'
import { formatFull } from '../../lib/time'
import { BusyButton } from '../Busy/BusyButton'
import { Skeleton } from '../Busy/Skeleton'
import { Select } from '../Select/Select'
import { reason } from '../Settings/SenderCard'
import { Switch } from '../Settings/Switch'

/**
 * CryptFlare: Connect opens the browser to approve Buun Mail, then the person chooses the workspace and environment
 * saves go to and turns on saving agent identities. Each new or changed dissolve.email identity is then saved there by
 * the Rust side; this panel shows what is waiting, when the last save went through, and why saving stopped.
 */
export function CryptFlareConnect({ onConnected }: { onConnected: (connected: boolean) => void }): ReactNode {
  const { t } = useTranslation('integrations')
  const [status, setStatus] = useState<CryptFlareStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    cryptflareStatus()
      .then(setStatus)
      .catch((cause: unknown) => setError(reason(cause)))
  }, [])

  const connect = (): void => {
    setBusy(true)
    setError(null)
    connectCryptflare()
      .then((next) => {
        setStatus(next)
        onConnected(next.connected)
        toast({ text: t('cryptflare.connected'), ...(next.organisation === null ? {} : { detail: next.organisation }), tone: 'done' })
      })
      .catch((cause: unknown) => setError(reason(cause)))
      .finally(() => setBusy(false))
  }

  const disconnect = (): void => {
    void disconnectCryptflare().then((next) => {
      setStatus(next)
      onConnected(next.connected)
      toast({ text: t('cryptflare.disconnected'), tone: 'done' })
    })
  }

  if (status === null)
    return error === null ? (
      <Skeleton label={t('loading')} />
    ) : (
      <p role="alert" className="settings__error">
        {error}
      </p>
    )
  if (!status.connected) {
    return (
      <div className="connect">
        <p className="settings__hint">{t('cryptflare.intro')}</p>
        {busy && <p className="settings__hint">{t('cryptflare.waiting')}</p>}
        {error !== null && (
          <p role="alert" className="settings__error">
            {error}
          </p>
        )}
        <div className="connect__actions">
          <button type="button" className="connect__submit" disabled={busy} onClick={connect}>
            {busy ? t('cryptflare.waitingButton') : t('cryptflare.connect')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="senders">
      <section className="sender" aria-labelledby="cryptflare-account">
        <div className="sender__head">
          <h5 id="cryptflare-account" className="settings__label">
            {status.organisation ?? t('cryptflare.organisation')}
          </h5>
        </div>
        <p className="settings__hint">
          {status.lastSaved === null ? t('cryptflare.neverSaved') : t('cryptflare.lastSaved', { time: formatFull(status.lastSaved) })} {status.pending > 0 && t('cryptflare.pending', { count: status.pending })}
        </p>
        {!status.canWrite && (
          <p role="alert" className="settings__error">
            {t('cryptflare.cannotWrite')}
          </p>
        )}
        {status.problem !== null && (
          <p role="alert" className="settings__error">
            {status.problem}
          </p>
        )}
        <Target status={status} onStatus={setStatus} />
        <div className="settings__row">
          <div>
            <p id="cryptflare-auto-label" className="settings__label">
              {t('cryptflare.autoTitle')}
            </p>
            <p className="settings__hint">{status.target === null ? t('cryptflare.autoNeedsTarget') : t('cryptflare.autoHint')}</p>
          </div>
          <Switch id="cryptflare-auto" labelledBy="cryptflare-auto-label" checked={status.saveIdentities} disabled={status.target === null || !status.canWrite} onChange={(on) => void setCryptflareSaveIdentities(on).then(setStatus)} />
        </div>
        {status.target !== null && status.canWrite && (
          <div className="settings__row">
            <div>
              <p className="settings__label">{t('cryptflare.saveAllTitle')}</p>
              <p className="settings__hint">{t('cryptflare.saveAllHint')}</p>
            </div>
            <BusyButton
              className="settings__button"
              glyph={IconIdentity}
              busyLabel={t('cryptflare.savingAll')}
              run={() =>
                saveIdentitiesToCryptflare()
                  .then(async (count) => {
                    toast({ text: t('cryptflare.savedAll', { count }), tone: 'done', glyph: IconIdentity })
                    setStatus(await cryptflareStatus())
                  })
                  .catch((cause: unknown) => {
                    toast({ text: t('cryptflare.saveFailed'), detail: reason(cause), tone: 'problem' })
                    throw cause
                  })
              }
            >
              {t('cryptflare.saveAll')}
            </BusyButton>
          </div>
        )}
        <div className="settings__actions settings__actions--tight">
          {status.pending > 0 && (
            <BusyButton
              className="settings__button"
              glyph={IconRegenerate}
              busyLabel={t('cryptflare.retrying')}
              run={() =>
                flushCryptflare()
                  .then(async (count) => {
                    toast({ text: t('cryptflare.retried', { count }), tone: 'done' })
                    setStatus(await cryptflareStatus())
                  })
                  .catch(async (cause: unknown) => {
                    toast({ text: t('cryptflare.saveFailed'), detail: reason(cause), tone: 'problem' })
                    setStatus(await cryptflareStatus())
                    throw cause
                  })
              }
            >
              {t('cryptflare.retry')}
            </BusyButton>
          )}
          <button type="button" className="settings__button" title={t('cryptflare.disconnectHint')} onClick={disconnect}>
            {t('cryptflare.disconnect')}
          </button>
        </div>
      </section>
    </div>
  )
}

/** The workspace and environment saves go to: the environment list follows the workspace chosen. */
function Target({ status, onStatus }: { status: CryptFlareStatus; onStatus: (next: CryptFlareStatus) => void }): ReactNode {
  const { t } = useTranslation('integrations')
  const [workspaces, setWorkspaces] = useState<CryptFlareChoice[] | null>(null)
  const [environments, setEnvironments] = useState<CryptFlareChoice[]>([])
  const [workspace, setWorkspace] = useState(status.target?.workspaceId ?? '')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    cryptflareWorkspaces()
      .then(setWorkspaces)
      .catch((cause: unknown) => setError(reason(cause)))
  }, [])

  useEffect(() => {
    if (workspace === '') return
    cryptflareEnvironments(workspace)
      .then(setEnvironments)
      .catch((cause: unknown) => setError(reason(cause)))
  }, [workspace])

  const chooseEnvironment = (environment: string): void => {
    const space = workspaces?.find((choice) => choice.id === workspace)
    const place = environments.find((choice) => choice.id === environment)
    if (space === undefined || place === undefined) return
    void setCryptflareTarget({ workspaceId: space.id, workspaceName: space.name, environmentId: place.id, environmentName: place.name }).then((next) => {
      onStatus(next)
      toast({ text: t('cryptflare.targetSaved', { workspace: space.name, environment: place.name }), tone: 'done' })
    })
  }

  return (
    <div className="settings__row">
      <div>
        <p className="settings__label">{t('cryptflare.targetTitle')}</p>
        <p className="settings__hint">{workspaces !== null && workspaces.length === 0 ? t('cryptflare.noWorkspaces') : t('cryptflare.targetHint')}</p>
        {error !== null && (
          <p role="alert" className="settings__error">
            {error}
          </p>
        )}
      </div>
      <div className="connect__field">
        <label htmlFor="cryptflare-workspace">{t('cryptflare.workspace')}</label>
        <Select
          id="cryptflare-workspace"
          value={workspace}
          placeholder={t('cryptflare.choose')}
          options={(workspaces ?? []).map((choice) => ({ value: choice.id, label: choice.name }))}
          onChange={(next) => {
            setWorkspace(next)
            setEnvironments([])
          }}
        />
        <label htmlFor="cryptflare-environment">{t('cryptflare.environment')}</label>
        <Select
          id="cryptflare-environment"
          value={status.target?.workspaceId === workspace ? status.target.environmentId : ''}
          placeholder={t('cryptflare.choose')}
          disabled={workspace === ''}
          options={environments.map((choice) => ({ value: choice.id, label: choice.name }))}
          onChange={chooseEnvironment}
        />
      </div>
    </div>
  )
}
