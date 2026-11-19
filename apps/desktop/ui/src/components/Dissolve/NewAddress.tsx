import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { createDissolveInbox, dissolveDomains } from '../../api/client'
import type { DissolveInbox } from '../../api/types'
import { Popover } from '../Popover/Popover'
import { Select } from '../Select/Select'

const reason = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause))

/**
 * Makes a dissolve.email address: on the account's default domain or another, with an optional name before the @
 * (a Pro and Business feature; dissolve.email says so when the plan has none). Left empty, the name is random.
 */
export function NewAddress({ anchor, onMade, onClose }: { anchor: HTMLElement; onMade: (inbox: DissolveInbox) => void; onClose: () => void }): ReactNode {
  const { t } = useTranslation('mail')
  const [domains, setDomains] = useState<string[]>([])
  const [domain, setDomain] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    dissolveDomains()
      .then((found) => {
        setDomains(found)
        setDomain(found[0] ?? '')
      })
      .catch((cause: unknown) => setError(reason(cause)))
  }, [])

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    createDissolveInbox({ ...(domain === '' ? {} : { domain }), ...(name.trim() === '' ? {} : { name: name.trim() }) })
      .then(onMade)
      .catch((cause: unknown) => setError(reason(cause)))
      .finally(() => setBusy(false))
  }

  return (
    <Popover anchor={anchor} label={t('dissolve.newAddress')} onClose={onClose}>
      <form className="new-address" onSubmit={submit}>
        <label className="new-address__field" htmlFor="new-address-name">
          {t('dissolve.nameLabel')}
        </label>
        <div className="new-address__address">
          <input id="new-address-name" value={name} placeholder={t('dissolve.namePlaceholder')} onChange={(event) => setName(event.target.value)} autoComplete="off" spellCheck={false} />
          <span aria-hidden="true">@</span>
          {domains.length > 0 && <Select id="new-address-domain" value={domain} options={domains.map((item) => ({ value: item, label: item }))} onChange={setDomain} />}
        </div>
        <small className="new-address__hint">{t('dissolve.nameHint')}</small>
        {error !== null && (
          <p role="alert" className="new-address__error">
            {error}
          </p>
        )}
        <button type="submit" className="new-address__make" disabled={busy}>
          {busy ? t('dissolve.making') : t('dissolve.make')}
        </button>
      </form>
    </Popover>
  )
}
