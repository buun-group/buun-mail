import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { lockReveals, revealStatus, setRevealCode } from '../../api/client'
import type { RevealStatus } from '../../api/types'
import { IconLock } from '../../icons'
import { toast } from '../../lib/feedback'

/**
 * How secrets are kept, and the reveal code: set it to be asked before a saved key, token or password is shown again;
 * change or remove it with the current one; lock reveals at once. The code never leaves this computer and is kept only
 * as a hash.
 */
export function SecuritySection(): ReactNode {
  const { t } = useTranslation('settings')
  const [status, setStatus] = useState<RevealStatus | null>(null)
  const [current, setCurrent] = useState('')
  const [code, setCode] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void revealStatus().then(setStatus)
  }, [])

  const save = (next: string | null) => (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    if (next !== null && next !== again) {
      setError(t('security.mismatch'))
      return
    }
    setError(null)
    setRevealCode(current === '' ? null : current, next)
      .then((saved) => {
        setStatus(saved)
        setCurrent('')
        setCode('')
        setAgain('')
        toast({ text: next === null ? t('security.removed') : t('security.saved'), tone: 'done', glyph: IconLock })
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
  }

  if (status === null) return null
  return (
    <div className="settings__rows">
      <section className="security__intro" aria-labelledby="security-sealed">
        <h4 id="security-sealed" className="settings__label">
          {t('security.sealedTitle')}
        </h4>
        <p className="settings__hint">{t('security.sealedHint')}</p>
      </section>
      <form className="connect" onSubmit={save(code.trim() === '' ? null : code)}>
        <h4 className="settings__label">{t('security.codeTitle')}</h4>
        <p className="settings__hint">{status.codeSet ? t('security.codeSetHint') : t('security.codeHint')}</p>
        {status.codeSet && (
          <div className="connect__field">
            <label htmlFor="reveal-current">{t('security.current')}</label>
            <input id="reveal-current" type="password" autoComplete="off" value={current} onChange={(event) => setCurrent(event.target.value)} />
          </div>
        )}
        <div className="connect__row">
          <div className="connect__field">
            <label htmlFor="reveal-code">{status.codeSet ? t('security.newCode') : t('security.code')}</label>
            <input id="reveal-code" type="password" autoComplete="new-password" value={code} onChange={(event) => setCode(event.target.value)} />
          </div>
          <div className="connect__field">
            <label htmlFor="reveal-again">{t('security.again')}</label>
            <input id="reveal-again" type="password" autoComplete="new-password" value={again} onChange={(event) => setAgain(event.target.value)} />
          </div>
        </div>
        {error !== null && (
          <p role="alert" className="settings__error">
            {error}
          </p>
        )}
        <div className="settings__actions">
          <button type="submit" className="connect__submit" disabled={code.trim() === ''}>
            {status.codeSet ? t('security.change') : t('security.set')}
          </button>
          {status.codeSet && (
            <>
              <button type="button" className="settings__button settings__button--danger" onClick={() => save(null)()}>
                {t('security.remove')}
              </button>
              <button type="button" className="settings__button" onClick={() => void lockReveals().then(setStatus)}>
                <IconLock aria-hidden="true" />
                {status.openFor > 0 ? t('security.lockNow') : t('security.locked')}
              </button>
            </>
          )}
        </div>
        <p className="settings__hint">{t('security.passkeyLater')}</p>
      </form>
    </div>
  )
}
