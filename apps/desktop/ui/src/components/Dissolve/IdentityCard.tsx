import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { addDissolveIdentity, connectDissolve, dissolveIdentity, regenerateDissolveIdentity } from '../../api/client'
import type { DissolveIdentities, DissolveIdentity, DissolveInbox, DissolveStatus } from '../../api/types'
import { IconAdd, IconClose, IconCopy, IconIdentity, IconRegenerate } from '../../icons'
import { copyWithToast } from '../../lib/copy'
import { toast } from '../../lib/feedback'
import { BusyButton } from '../Busy/BusyButton'
import { Skeleton } from '../Busy/Skeleton'
import { Confirm } from '../Confirm/Confirm'
import type { Confirmation } from '../Confirm/Confirm'
import { SecretField } from '../Settings/SecretField'

const reason = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause))

/** One value of the identity: the whole row copies it, with a copy glyph to say so. */
function Field({ label, value }: { label: string; value: string | null }): ReactNode {
  const { t } = useTranslation('mail')
  if (value === null || value === '') return null
  return (
    <button type="button" className="identity-card__field" aria-label={t('identity.copyField', { field: label })} onClick={(event) => void copyWithToast(value, t('identity.copied', { field: label }), event.currentTarget)}>
      <span className="identity-card__label">{label}</span>
      <span className="identity-card__value">{value}</span>
      <IconCopy className="identity-card__copy" aria-hidden="true" />
    </button>
  )
}

/**
 * Asks dissolve.email for agent identities: a fresh sign-in in the browser that adds the identity scopes. Kept out of
 * the first sign-in because dissolve.email's approval page refuses a scope the plan lacks.
 */
export async function allowIdentities(): Promise<DissolveStatus> {
  return connectDissolve(undefined, true)
}

/**
 * An address's agent identity, as the dissolve.email app shows it: the email, a strong password (hidden until shown,
 * through the reveal code when one is set, and read from dissolve.email each time, never kept here) and a made-up
 * person to fill in a sign-up form with. Every value copies with a click. Regenerate swaps in a new person and
 * password after asking; an address without one can be given one, on a plan that has them.
 */
export function IdentityCard({ inbox, identities, onClose, onStatus }: { inbox: DissolveInbox; identities: DissolveIdentities; onClose: () => void; onStatus: (status: DissolveStatus) => void }): ReactNode {
  const { t } = useTranslation('mail')
  // undefined while loading, null when the address has none.
  const [loaded, setIdentity] = useState<DissolveIdentity | null | undefined>(undefined)
  const [problem, setProblem] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<Confirmation | null>(null)
  // Bumped after a regenerate, so the password field forgets a password it was showing.
  const [turn, setTurn] = useState(0)

  useEffect(() => {
    if (!identities.granted) return undefined
    let live = true
    dissolveIdentity(inbox.id)
      .then((found) => {
        if (live) setIdentity(found)
      })
      .catch((cause: unknown) => {
        if (live) setProblem(reason(cause))
      })
    return () => {
      live = false
    }
  }, [inbox.id, identities.granted])

  const add = async (): Promise<void> => {
    try {
      setIdentity(await addDissolveIdentity(inbox.id))
      toast({ text: t('identity.made'), detail: inbox.address, tone: 'done', glyph: IconIdentity })
    } catch (cause) {
      toast({ text: t('identity.makeFailed'), detail: reason(cause), tone: 'problem' })
      throw cause
    }
  }
  const allow = async (): Promise<void> => {
    try {
      const next = await allowIdentities()
      onStatus(next)
      toast({ text: next.identities.granted ? t('identity.allowed') : t('identity.notAllowed'), tone: next.identities.granted ? 'done' : 'problem' })
    } catch (cause) {
      toast({ text: t('identity.allowFailed'), detail: reason(cause), tone: 'problem' })
      throw cause
    }
  }
  const regenerate = (): void =>
    setConfirming({
      title: t('identity.regenerateTitle'),
      body: t('identity.regenerateBody'),
      action: t('identity.regenerate'),
      run: () => {
        regenerateDissolveIdentity(inbox.id)
          .then((fresh) => {
            setIdentity(fresh)
            setTurn((value) => value + 1)
            toast({ text: t('identity.regenerated'), detail: inbox.address, tone: 'done', glyph: IconRegenerate })
          })
          .catch((cause: unknown) => toast({ text: t('identity.regenerateFailed'), detail: reason(cause), tone: 'problem' }))
      },
    })

  // Until identities are allowed for Buun Mail, dissolve.email will not show one, so there is nothing to read.
  const identity = identities.granted ? loaded : null
  const persona = identity?.persona ?? null
  let body: ReactNode
  if (problem !== null) {
    body = (
      <p role="alert" className="identity-card__note identity-card__note--problem">
        {problem}
      </p>
    )
  } else if (identity === undefined) {
    body = <Skeleton label={t('identity.loading')} />
  } else if (identity === null) {
    body = (
      <div className="identity-card__empty">
        <p className="identity-card__note">{identities.plan === false ? t('identity.notOnPlan') : identities.granted ? t('identity.none') : t('identity.notAllowedYet')}</p>
        {identities.plan !== false && !inbox.ended && (
          <BusyButton className="dissolve-bar__button" glyph={IconAdd} busyLabel={identities.granted ? t('identity.making') : t('identity.allowing')} run={identities.granted ? add : allow}>
            {identities.granted ? t('identity.make') : t('identity.allow')}
          </BusyButton>
        )}
      </div>
    )
  } else {
    body = (
      <>
        <div className="identity-card__fields">
          <Field label={t('identity.email')} value={identity.email} />
          {persona !== null && (
            <>
              <Field label={t('identity.name')} value={persona.fullName} />
              <Field label={t('identity.username')} value={persona.username} />
              <Field label={t('identity.birthday')} value={persona.dateOfBirth} />
              <Field label={t('identity.phone')} value={persona.phone} />
              <Field label={t('identity.address')} value={persona.address.formatted || [persona.address.street, persona.address.city, persona.address.state, persona.address.zip].filter(Boolean).join(', ')} />
            </>
          )}
        </div>
        {identity.hasPassword ? <SecretField key={turn} kind="identity" id={inbox.id} label={t('identity.password')} /> : <p className="identity-card__note">{t('identity.noPassword')}</p>}
        <p className="identity-card__note">{t('identity.madeUp')}</p>
      </>
    )
  }

  return (
    <section className="identity-card" aria-labelledby={`identity-${inbox.id}`}>
      <header className="identity-card__head">
        <IconIdentity aria-hidden="true" />
        <h3 id={`identity-${inbox.id}`}>{t('identity.title')}</h3>
        {identity != null && !inbox.ended && (
          <button type="button" className="dissolve-bar__button" onClick={regenerate}>
            <IconRegenerate aria-hidden="true" />
            {t('identity.regenerate')}
          </button>
        )}
        <button type="button" className="dissolve-bar__button" aria-label={t('identity.close')} onClick={onClose}>
          <IconClose aria-hidden="true" />
        </button>
      </header>
      {body}
      <Confirm request={confirming} cancelLabel={t('actions.cancel')} onClose={() => setConfirming(null)} />
    </section>
  )
}
