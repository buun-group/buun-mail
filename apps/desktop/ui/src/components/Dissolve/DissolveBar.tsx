import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { addDissolveAlias, burnDissolveInbox, dissolveAliases, dissolveStatus, extendDissolveInbox, removeDissolveAlias } from '../../api/client'
import type { DissolveAlias, DissolveInbox, DissolveStatus, MadeDissolveInbox, Place } from '../../api/types'
import i18n from '../../i18n'
import { IconAdd, IconAt, IconBurn, IconCopy, IconDelete, IconExtend, IconIdentity, IconTimer } from '../../icons'
import { copyWithToast } from '../../lib/copy'
import { STORAGE_KEYS } from '../../constants/ui'
import { isBusy } from '../../hooks/useMailKeys'
import { DISSOLVE_WORKSPACE, formatTimeLeft, readMeter, timeLeft } from '../../lib/dissolve'
import { formatListed } from '../../lib/time'
import { TipButton } from '../Tooltip/TipButton'
import { toast } from '../../lib/feedback'
import { Skeleton } from '../Busy/Skeleton'
import { Confirm } from '../Confirm/Confirm'
import type { Confirmation } from '../Confirm/Confirm'
import { Popover } from '../Popover/Popover'
import { IdentityDrawer } from './IdentityDrawer'
import { NewAddress } from './NewAddress'

import './Dissolve.css'

/** How often the time left is redrawn. */
const TICK_MS = 30_000

/** Live inboxes and new ones this hour against the plan, leaving out what dissolve.email has not reported. */
function usageWords(status: DissolveStatus): string {
  const known = (meter: { used: number | null; limit: number | null }): boolean => meter.used !== null && meter.limit !== null
  const parts: string[] = []
  if (known(status.limits.inboxes)) parts.push(i18n.t('mail:dissolve.usageInboxes', { value: readMeter(status.limits.inboxes).value }))
  if (known(status.limits.hourlyCreations)) parts.push(i18n.t('mail:dissolve.usageHourly', { value: readMeter(status.limits.hourlyCreations).value }))
  return parts.join(', ')
}

const reason = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause))

/** The address whose identity drawer opens when its folder does: one just made with an identity. */
let openIdentityFor: string | null = null

/** Whether the identity drawer was left open; open unless the person collapsed it. */
function drawerOpen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.identityDrawer) !== 'closed'
  } catch {
    return true
  }
}

function rememberDrawer(open: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS.identityDrawer, open ? 'open' : 'closed')
  } catch {
    // Without storage it simply opens next time.
  }
}

/**
 * The dissolve.email workspace's bar under the list header. On the workspace's own inbox: the account and New address.
 * On an inbox's folder: its address to copy, the time it has left, Extend, Burn (asked first), and Identity, which opens
 * its agent identity under the bar. Keyed by folder, so each folder reads the status afresh.
 */
export function DissolveBar({ place, onOpen }: { place: Place; onOpen: (place: Place) => void }): ReactNode {
  const { t } = useTranslation('mail')
  const [status, setStatus] = useState<DissolveStatus | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState<Confirmation | null>(null)
  const [making, setMaking] = useState<HTMLElement | null>(null)
  const [aliasing, setAliasing] = useState<HTMLElement | null>(null)
  // A folder opened straight after making its address with an identity shows the drawer, glowing for a moment.
  const [fresh] = useState(() => place.folder !== null && place.folder === openIdentityFor)
  const [showIdentity, setShowIdentity] = useState(() => fresh || drawerOpen())
  const toggleIdentity = (): void =>
    setShowIdentity((open) => {
      rememberDrawer(!open)
      return !open
    })

  useEffect(() => {
    if (place.folder !== null && place.folder === openIdentityFor) openIdentityFor = null
  }, [place.folder])

  useEffect(() => {
    let live = true
    void dissolveStatus().then((found) => {
      if (live) setStatus(found)
    })
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS)
    return () => {
      live = false
      window.clearInterval(timer)
    }
  }, [])

  // I opens and tucks away the identity drawer on an address's folder, as the bar's Identity button does.
  const folderInbox = status === null || place.folder === null ? undefined : status.inboxes.find((item) => item.address === place.folder)
  const drawerKey = folderInbox !== undefined && status !== null && (folderInbox.identity || status.identities.plan === true)
  useEffect(() => {
    if (!drawerKey) return undefined
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'i' || isBusy(event)) return
      event.preventDefault()
      setShowIdentity((open) => {
        rememberDrawer(!open)
        return !open
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerKey])

  if (status === null) return null
  const inbox = place.folder === null ? undefined : status.inboxes.find((item) => item.address === place.folder)

  const made = (inboxMade: MadeDissolveInbox): void => {
    setMaking(null)
    if (inboxMade.identityMade !== null) openIdentityFor = inboxMade.address
    const copied = inboxMade.identityMade !== null ? t('identity.madeWithAddress') : t('dissolve.madeCopied')
    void copyWithToast(inboxMade.address, copied).then(() => {
      if (inboxMade.identitySkipped !== null) toast({ text: t('identity.skipped'), detail: inboxMade.identitySkipped, tone: 'problem', glyph: IconIdentity })
      onOpen({ workspace: DISSOLVE_WORKSPACE, folder: inboxMade.address })
    })
  }

  if (inbox === undefined) {
    return (
      <div className="dissolve-bar">
        <p className="dissolve-bar__info">
          {status.connected ? (
            <>
              <span>{status.email ?? ''}</span>
              <span className="dissolve-bar__usage" data-full={readMeter(status.limits.inboxes).full || readMeter(status.limits.hourlyCreations).full}>
                {usageWords(status)}
              </span>
            </>
          ) : (
            t('dissolve.notConnected')
          )}
        </p>
        {status.connected && (
          <button type="button" className="dissolve-bar__button" aria-expanded={making !== null} onClick={(event) => setMaking(event.currentTarget)}>
            <IconAdd aria-hidden="true" />
            {t('dissolve.newAddress')}
          </button>
        )}
        {making !== null && <NewAddress anchor={making} identities={status.identities} onStatus={setStatus} onMade={made} onClose={() => setMaking(null)} />}
      </div>
    )
  }

  const left = timeLeft(inbox.expiresAt, now)
  const extensions = inbox.extensions
  const plan = status.limits.plan ?? ''
  // Why Extend is off, when dissolve.email has said: none left, or not yet.
  const extendBlocked =
    extensions?.lifetimeReached === true && extensions.lifetimeEndsAt !== null
      ? t('dissolve.lifetimeReached', { time: formatListed(extensions.lifetimeEndsAt) })
      : extensions?.canExtend === false
      ? extensions.availableAt !== null && Date.parse(extensions.availableAt) > now
        ? t('dissolve.extendFrom', { time: formatListed(extensions.availableAt) })
        : t('dissolve.extendUsed', { used: extensions.used ?? 0, limit: extensions.limit ?? 0, plan })
      : null
  const extend = (): void => {
    setBusy(true)
    extendDissolveInbox(inbox.id)
      .then((next) => {
        setStatus(next)
        toast({ text: t('dissolve.extended'), detail: inbox.address, tone: 'done' })
      })
      .catch((cause: unknown) => toast({ text: t('dissolve.extendFailed'), detail: reason(cause), tone: 'problem' }))
      .finally(() => setBusy(false))
  }
  const burn = (): void =>
    setConfirming({
      title: t('dissolve.burnTitle', { address: inbox.address }),
      body: t('dissolve.burnBody'),
      action: t('dissolve.burn'),
      run: () => {
        burnDissolveInbox(inbox.id)
          .then((next) => {
            setStatus(next)
            toast({ text: t('dissolve.burned'), detail: inbox.address, tone: 'done', glyph: IconBurn })
            onOpen({ workspace: DISSOLVE_WORKSPACE, folder: null })
          })
          .catch((cause: unknown) => toast({ text: t('dissolve.burnFailed'), detail: reason(cause), tone: 'problem' }))
      },
    })

  // Identity shows once the plan has them or this address is known to have one; Free accounts never see it.
  const identityOn = inbox.identity || status.identities.plan === true
  // Aliases are a Pro and Business feature; a live inbox on a paid plan offers them.
  const aliasesOn = status.connected && !inbox.ended && status.limits.plan !== null && status.limits.plan !== 'free'
  // One element: the list gives its banner a single grid row. The identity drawer renders at the window's edge.
  return (
    <div className="dissolve-banner">
    <div className="dissolve-bar">
      <button type="button" className="dissolve-bar__address" onClick={(event) => void copyWithToast(inbox.address, undefined, event.currentTarget)} aria-label={t('dissolve.copyAddress', { address: inbox.address })}>
        <span>{inbox.address}</span>
        <IconCopy aria-hidden="true" />
      </button>
      <span className="dissolve-bar__left" data-soon={left.soon}>
        <IconTimer aria-hidden="true" />
        {inbox.ended ? t('dissolve.endedKept') : formatTimeLeft(left)}
      </span>
      {extensions?.used != null && extensions.limit !== null && <span className="dissolve-bar__count">{t('dissolve.extensionsCount', { used: extensions.used, limit: extensions.limit })}</span>}
      {!inbox.ended && extensions?.lifetimeEndsAt != null && extensions.lifetimeReached !== true && <span className="dissolve-bar__count">{t('dissolve.endsForGood', { time: formatListed(extensions.lifetimeEndsAt) })}</span>}
      {!inbox.ended && status.connected && (
        <TipButton tip={extendBlocked} className="dissolve-bar__button" aria-disabled={extendBlocked !== null || busy || undefined} onClick={extendBlocked === null && !busy ? extend : undefined}>
          <IconExtend aria-hidden="true" />
          {t('dissolve.extend')}
        </TipButton>
      )}
      {aliasesOn && (
        <button type="button" className="dissolve-bar__button" aria-expanded={aliasing !== null} onClick={(event) => setAliasing(event.currentTarget)}>
          <IconAt aria-hidden="true" />
          {t('aliases.button')}
        </button>
      )}
      {identityOn && (
        <button type="button" className="dissolve-bar__button" aria-expanded={showIdentity} onClick={toggleIdentity}>
          <IconIdentity aria-hidden="true" />
          {t('identity.button')}
        </button>
      )}
      <button type="button" className="dissolve-bar__button dissolve-bar__button--danger" disabled={busy} onClick={burn}>
        <IconBurn aria-hidden="true" />
        {inbox.ended ? t('dissolve.deleteHere') : t('dissolve.burn')}
      </button>
      <Confirm request={confirming} cancelLabel={t('actions.cancel')} onClose={() => setConfirming(null)} />
      {aliasing !== null && <Aliases anchor={aliasing} inbox={inbox} onClose={() => setAliasing(null)} />}
    </div>
    {identityOn && <IdentityDrawer inbox={inbox} identities={status.identities} open={showIdentity} fresh={fresh} onToggle={toggleIdentity} onStatus={setStatus} />}
    </div>
  )
}

/**
 * An inbox's aliases (Pro and Business): other addresses on its domain that deliver into it, so their mail lands in
 * the same folder. Lists them with Copy and Remove, and adds one by the part before the @.
 */
function Aliases({ anchor, inbox, onClose }: { anchor: HTMLElement; inbox: DissolveInbox; onClose: () => void }): ReactNode {
  const { t } = useTranslation('mail')
  const [aliases, setAliases] = useState<DissolveAlias[] | null>(null)
  const [local, setLocal] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const domain = inbox.address.split('@')[1] ?? ''

  useEffect(() => {
    let live = true
    dissolveAliases(inbox.id)
      .then((found) => {
        if (live) setAliases(found)
      })
      .catch((cause: unknown) => {
        if (!live) return
        setAliases([])
        setError(reason(cause))
      })
    return () => {
      live = false
    }
  }, [inbox.id])

  const add = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const wanted = local.trim().toLowerCase()
    if (wanted === '') return
    setBusy(true)
    setError(null)
    addDissolveAlias(inbox.id, wanted)
      .then((next) => {
        setAliases(next)
        setLocal('')
        const made = next.find((alias) => alias.address.startsWith(`${wanted}@`))
        if (made !== undefined) void copyWithToast(made.address, t('aliases.added'))
      })
      .catch((cause: unknown) => setError(reason(cause)))
      .finally(() => setBusy(false))
  }
  const remove = (alias: DissolveAlias): void => {
    removeDissolveAlias(inbox.id, alias.id)
      .then((next) => {
        setAliases(next)
        toast({ text: t('aliases.removed'), detail: alias.address, tone: 'done' })
      })
      .catch((cause: unknown) => toast({ text: t('aliases.failed'), detail: reason(cause), tone: 'problem' }))
  }

  return (
    <Popover anchor={anchor} label={t('aliases.title', { address: inbox.address })} onClose={onClose}>
      <div className="aliases">
        <p className="aliases__hint">{t('aliases.hint')}</p>
        {aliases === null ? (
          <Skeleton rows={2} label={t('aliases.loading')} />
        ) : aliases.length === 0 ? (
          <p className="aliases__none">{t('aliases.none')}</p>
        ) : (
          <ul className="aliases__list">
            {aliases.map((alias) => (
              <li key={alias.id} className="aliases__row">
                <span className="aliases__address">{alias.address}</span>
                <TipButton tip={t('aliases.copy', { address: alias.address })} className="overview__tool" aria-label={t('aliases.copy', { address: alias.address })} onClick={(event) => void copyWithToast(alias.address, undefined, event.currentTarget)}>
                  <IconCopy aria-hidden="true" />
                </TipButton>
                <TipButton tip={t('aliases.remove', { address: alias.address })} className="overview__tool overview__tool--danger" aria-label={t('aliases.remove', { address: alias.address })} onClick={() => remove(alias)}>
                  <IconDelete aria-hidden="true" />
                </TipButton>
              </li>
            ))}
          </ul>
        )}
        <form className="new-address" onSubmit={add}>
          <label className="new-address__field" htmlFor="alias-local">
            {t('aliases.label')}
          </label>
          <div className="new-address__address new-address__address--wide">
            <input id="alias-local" value={local} placeholder={t('aliases.placeholder')} onChange={(event) => setLocal(event.target.value)} autoComplete="off" spellCheck={false} />
            <span aria-hidden="true">@{domain}</span>
          </div>
          {error !== null && (
            <p role="alert" className="new-address__error">
              {error}
            </p>
          )}
          <button type="submit" className="new-address__make" disabled={busy || local.trim() === ''}>
            {busy ? t('aliases.adding') : t('aliases.add')}
          </button>
        </form>
      </div>
    </Popover>
  )
}
