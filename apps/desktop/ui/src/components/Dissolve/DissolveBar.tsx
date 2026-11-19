import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { burnDissolveInbox, dissolveStatus, extendDissolveInbox } from '../../api/client'
import type { DissolveInbox, DissolveStatus, Place } from '../../api/types'
import { IconAdd, IconBurn, IconCopy, IconExtend, IconTimer } from '../../icons'
import { copyWithToast } from '../../lib/copy'
import { DISSOLVE_WORKSPACE, formatTimeLeft, readMeter, timeLeft } from '../../lib/dissolve'
import { formatListed } from '../../lib/time'
import { TipButton } from '../Tooltip/TipButton'
import { toast } from '../../lib/feedback'
import { Confirm } from '../Confirm/Confirm'
import type { Confirmation } from '../Confirm/Confirm'
import { NewAddress } from './NewAddress'

import './Dissolve.css'

/** How often the time left is redrawn. */
const TICK_MS = 30_000

const reason = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause))

/**
 * The dissolve.email workspace's bar under the list header. On the workspace's own inbox: the account and New address.
 * On an inbox's folder: its address to copy, the time it has left, Extend, and Burn (asked first). Keyed by folder, so
 * each folder reads the status afresh.
 */
export function DissolveBar({ place, onOpen }: { place: Place; onOpen: (place: Place) => void }): ReactNode {
  const { t } = useTranslation('mail')
  const [status, setStatus] = useState<DissolveStatus | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState<Confirmation | null>(null)
  const [making, setMaking] = useState<HTMLElement | null>(null)

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

  if (status === null) return null
  const inbox = place.folder === null ? undefined : status.inboxes.find((item) => item.address === place.folder)

  const made = (fresh: DissolveInbox): void => {
    setMaking(null)
    void copyWithToast(fresh.address, t('dissolve.madeCopied')).then(() => onOpen({ workspace: DISSOLVE_WORKSPACE, folder: fresh.address }))
  }

  if (inbox === undefined) {
    return (
      <div className="dissolve-bar">
        <p className="dissolve-bar__info">
          {status.connected ? (
            <>
              <span>{status.email ?? ''}</span>
              <span className="dissolve-bar__usage" data-full={readMeter(status.limits.inboxes).full || readMeter(status.limits.hourlyCreations).full}>
                {t('dissolve.usage', { inboxes: readMeter(status.limits.inboxes).value, hourly: readMeter(status.limits.hourlyCreations).value })}
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
        {making !== null && <NewAddress anchor={making} onMade={made} onClose={() => setMaking(null)} />}
      </div>
    )
  }

  const left = timeLeft(inbox.expiresAt, now)
  const extensions = inbox.extensions
  const plan = status.limits.plan ?? ''
  // Why Extend is off, when dissolve.email has said: none left, or not yet.
  const extendBlocked =
    extensions?.canExtend === false
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

  return (
    <div className="dissolve-bar">
      <button type="button" className="dissolve-bar__address" onClick={() => void copyWithToast(inbox.address)} aria-label={t('dissolve.copyAddress', { address: inbox.address })}>
        <span>{inbox.address}</span>
        <IconCopy aria-hidden="true" />
      </button>
      <span className="dissolve-bar__left" data-soon={left.soon}>
        <IconTimer aria-hidden="true" />
        {inbox.ended ? t('dissolve.endedKept') : formatTimeLeft(left)}
      </span>
      {extensions?.used != null && extensions.limit !== null && <span className="dissolve-bar__count">{t('dissolve.extensionsCount', { used: extensions.used, limit: extensions.limit })}</span>}
      {!inbox.ended && status.connected && (
        <TipButton tip={extendBlocked} className="dissolve-bar__button" aria-disabled={extendBlocked !== null || busy || undefined} onClick={extendBlocked === null && !busy ? extend : undefined}>
          <IconExtend aria-hidden="true" />
          {t('dissolve.extend')}
        </TipButton>
      )}
      <button type="button" className="dissolve-bar__button dissolve-bar__button--danger" disabled={busy} onClick={burn}>
        <IconBurn aria-hidden="true" />
        {inbox.ended ? t('dissolve.deleteHere') : t('dissolve.burn')}
      </button>
      <Confirm request={confirming} cancelLabel={t('actions.cancel')} onClose={() => setConfirming(null)} />
    </div>
  )
}
