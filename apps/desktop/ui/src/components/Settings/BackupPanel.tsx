import { useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { createBackup, restoreBackup } from '../../api/client'
import { IconExport, IconReceive } from '../../icons'
import { toast } from '../../lib/feedback'

/** The shortest passphrase accepted; the Rust side holds the same line. */
const SHORTEST = 8

const reason = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause))

/**
 * Backup and restore: the whole mailbox and every setting in one file sealed with a passphrase, to keep somewhere safe
 * or move to another computer. A restore is checked first and takes effect at the next start, keeping the data it
 * replaces in a before-restore folder.
 */
export function BackupPanel(): ReactNode {
  const { t } = useTranslation('settings')
  const [passphrase, setPassphrase] = useState('')
  const [again, setAgain] = useState('')
  const [restoreWith, setRestoreWith] = useState('')
  const [busy, setBusy] = useState(false)
  const [restored, setRestored] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const backUp = (): void => {
    if (passphrase.length < SHORTEST) return setError(t('backup.tooShort', { count: SHORTEST }))
    if (passphrase !== again) return setError(t('backup.mismatch'))
    setError(null)
    setBusy(true)
    createBackup(passphrase)
      .then((files) => {
        if (files === null) return
        setPassphrase('')
        setAgain('')
        toast({ text: t('backup.saved'), detail: t('backup.savedDetail', { count: files }), tone: 'done', glyph: IconExport })
      })
      .catch((cause: unknown) => setError(reason(cause)))
      .finally(() => setBusy(false))
  }

  const restore = (): void => {
    setError(null)
    setBusy(true)
    restoreBackup(restoreWith)
      .then((files) => {
        if (files === null) return
        setRestoreWith('')
        setRestored(true)
        toast({ text: t('backup.staged'), detail: t('backup.stagedDetail', { count: files }), tone: 'done', glyph: IconReceive })
      })
      .catch((cause: unknown) => setError(reason(cause)))
      .finally(() => setBusy(false))
  }

  return (
    <section className="connect" aria-labelledby="backup-title">
      <h4 id="backup-title" className="settings__label">
        {t('backup.title')}
      </h4>
      <p className="settings__hint">{t('backup.hint')}</p>
      <div className="connect__row">
        <div className="connect__field">
          <label htmlFor="backup-passphrase">{t('backup.passphrase')}</label>
          <input id="backup-passphrase" type="password" autoComplete="new-password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} />
        </div>
        <div className="connect__field">
          <label htmlFor="backup-again">{t('backup.again')}</label>
          <input id="backup-again" type="password" autoComplete="new-password" value={again} onChange={(event) => setAgain(event.target.value)} />
        </div>
      </div>
      <p className="settings__hint">{t('backup.keepIt')}</p>
      <div className="settings__actions">
        <button type="button" className="connect__submit" disabled={busy || passphrase === ''} onClick={backUp}>
          <IconExport aria-hidden="true" />
          {busy ? t('backup.working') : t('backup.save')}
        </button>
      </div>
      <div className="connect__field">
        <label htmlFor="restore-passphrase">{t('backup.restorePassphrase')}</label>
        <input id="restore-passphrase" type="password" autoComplete="off" value={restoreWith} onChange={(event) => setRestoreWith(event.target.value)} />
      </div>
      <div className="settings__actions">
        <button type="button" className="settings__button" disabled={busy || restoreWith === ''} onClick={restore}>
          <IconReceive aria-hidden="true" />
          {t('backup.restore')}
        </button>
      </div>
      {restored && (
        <p role="status" className="settings__hint backup__restart">
          {t('backup.restart')}
        </p>
      )}
      {error !== null && (
        <p role="alert" className="settings__error">
          {error}
        </p>
      )}
    </section>
  )
}
