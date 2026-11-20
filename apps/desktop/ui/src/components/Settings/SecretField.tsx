import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { revealSecret, revealStatus } from '../../api/client'
import type { SecretKind } from '../../api/types'
import { IconCopy, IconHide, IconShow } from '../../icons'
import { copyWithToast } from '../../lib/copy'
import { TipButton } from '../Tooltip/TipButton'

/** How long a shown secret stays on screen before it hides itself. */
const SHOWN_MS = 30_000

/** Stands for a hidden secret: asterisks, never its length. */
const HIDDEN = '****************'

/**
 * A saved secret, hidden until asked for: the eye shows it (asking for the reveal code first when one is set and
 * reveals are not open), with Copy, and it hides again on its own after half a minute. The secret is fetched only
 * when shown and never kept once hidden.
 */
export function SecretField({ kind, id, label }: { kind: SecretKind; id: string; label: string }): ReactNode {
  const { t } = useTranslation('settings')
  const [shown, setShown] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const codeInput = useRef<HTMLInputElement | null>(null)

  // The code field takes focus when it appears, so the code can be typed at once.
  useEffect(() => {
    if (asking) codeInput.current?.focus()
  }, [asking])

  useEffect(() => {
    if (shown === null) return undefined
    const timer = window.setTimeout(() => setShown(null), SHOWN_MS)
    return () => window.clearTimeout(timer)
  }, [shown])

  const fetchSecret = (given: string | null): void => {
    revealSecret(kind, id, given)
      .then((secret) => {
        setShown(secret)
        setAsking(false)
        setCode('')
        setError(null)
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
  }
  const show = (): void => {
    if (shown !== null) {
      setShown(null)
      return
    }
    void revealStatus().then((status) => {
      if (status.codeSet && status.openFor === 0) setAsking(true)
      else fetchSecret(null)
    })
  }
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    fetchSecret(code)
  }

  return (
    <div className="secret-field">
      <span className="secret-field__label">{label}</span>
      <code className="secret-field__value" aria-live="polite">
        {shown ?? HIDDEN}
      </code>
      <TipButton tip={shown === null ? t('secret.show') : t('secret.hide')} className="settings__icon-button" aria-label={shown === null ? t('secret.showLabel', { label }) : t('secret.hideLabel', { label })} onClick={show}>
        {shown === null ? <IconShow aria-hidden="true" /> : <IconHide aria-hidden="true" />}
      </TipButton>
      {shown !== null && (
        <TipButton tip={t('secret.copy')} className="settings__icon-button" aria-label={t('secret.copyLabel', { label })} onClick={(event) => void copyWithToast(shown, t('secret.copied'), event.currentTarget)}>
          <IconCopy aria-hidden="true" />
        </TipButton>
      )}
      {asking && shown === null && (
        <form className="secret-field__code" onSubmit={submit}>
          <label htmlFor={`code-${kind}-${id}`}>{t('secret.code')}</label>
          <input id={`code-${kind}-${id}`} type="password" inputMode="text" autoComplete="off" value={code} onChange={(event) => setCode(event.target.value)} ref={codeInput} />
          <button type="submit" className="settings__button">
            {t('secret.unlock')}
          </button>
        </form>
      )}
      {error !== null && (
        <p role="alert" className="settings__error secret-field__error">
          {error}
        </p>
      )}
    </div>
  )
}
