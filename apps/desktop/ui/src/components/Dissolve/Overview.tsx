import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { burnDissolveInbox, dissolveStatus, extendDissolveInbox } from '../../api/client'
import type { DissolveInbox, DissolveStatus, Place, Workspace } from '../../api/types'
import { IconBurn, IconCopy, IconExtend, IconFolder, IconTimer, IconUnread } from '../../icons'
import { copyWithToast } from '../../lib/copy'
import { DISSOLVE_WORKSPACE, formatTimeLeft, timeLeft } from '../../lib/dissolve'
import { toast } from '../../lib/feedback'
import { Confirm } from '../Confirm/Confirm'
import type { Confirmation } from '../Confirm/Confirm'
import { TipButton } from '../Tooltip/TipButton'
import { useLeaving } from '../../hooks/useLeaving'
import { DissolveOut } from '../Motion/DissolveOut'
import { Skeleton } from '../Busy/Skeleton'

/** How often the time left is redrawn. */
const TICK_MS = 30_000

const reason = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause))

/**
 * The dissolve.email workspace's own page: every live inbox as a row with its address, name, time left, and how many
 * messages and unread it holds; clicking one opens its folder, and each has Copy, Extend and Burn. Inboxes that ended
 * on dissolve.email but whose mail was kept are listed apart.
 */
export function Overview({ workspace, onOpen }: { workspace: Workspace | undefined; onOpen: (place: Place) => void }): ReactNode {
  const { t } = useTranslation('mail')
  const [status, setStatus] = useState<DissolveStatus | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [confirming, setConfirming] = useState<Confirmation | null>(null)

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

  // An inbox that ends or is burned dissolves out of the list.
  const { list: kept, gone } = useLeaving(status?.inboxes ?? [], (inbox) => inbox.id, 'overview')
  if (status === null) return <div className="overview"><Skeleton rows={3} label={t('overview.loading')} /></div>
  const unreadOf = (address: string): number => workspace?.folders.find((folder) => folder.name === address)?.unread ?? 0
  const live = kept.filter((entry) => !entry.item.ended)
  const ended = kept.filter((entry) => entry.item.ended)

  const extend = (inbox: DissolveInbox): void => {
    extendDissolveInbox(inbox.id)
      .then((next) => {
        setStatus(next)
        toast({ text: t('dissolve.extended'), detail: inbox.address, tone: 'done' })
      })
      .catch((cause: unknown) => toast({ text: t('dissolve.extendFailed'), detail: reason(cause), tone: 'problem' }))
  }
  const burn = (inbox: DissolveInbox): void =>
    setConfirming({
      title: t('dissolve.burnTitle', { address: inbox.address }),
      body: t('dissolve.burnBody'),
      action: inbox.ended ? t('dissolve.deleteHere') : t('dissolve.burn'),
      run: () => {
        burnDissolveInbox(inbox.id)
          .then((next) => {
            setStatus(next)
            toast({ text: t('dissolve.burned'), detail: inbox.address, tone: 'done', glyph: IconBurn })
          })
          .catch((cause: unknown) => toast({ text: t('dissolve.burnFailed'), detail: reason(cause), tone: 'problem' }))
      },
    })

  const row = ({ item: inbox, leaving }: { item: DissolveInbox; leaving: boolean }): ReactNode => {
    const left = timeLeft(inbox.expiresAt, now)
    const unread = unreadOf(inbox.address)
    const blocked = inbox.extensions?.canExtend === false
    return (
      <DissolveOut as="li" key={inbox.id} out={leaving} onDone={() => gone(inbox.id)}>
      <div className="overview__row">
        <button type="button" className="overview__open" onClick={() => onOpen({ workspace: DISSOLVE_WORKSPACE, folder: inbox.address })}>
          <IconFolder aria-hidden="true" className="overview__glyph" />
          <span className="overview__who">
            <span className="overview__address">{inbox.address}</span>
            {inbox.name !== null && <span className="overview__name">{inbox.name}</span>}
          </span>
          <span className="overview__counts">
            {unread > 0 && (
              <span className="overview__unread">
                <IconUnread aria-hidden="true" />
                {t('overview.unread', { count: unread })}
              </span>
            )}
            <span>{t('overview.messages', { count: inbox.stored })}</span>
          </span>
          <span className="overview__left" data-soon={!inbox.ended && left.soon}>
            <IconTimer aria-hidden="true" />
            {inbox.ended ? t('overview.ended') : formatTimeLeft(left)}
          </span>
        </button>
        <span className="overview__tools">
          <TipButton tip={t('dissolve.copyAddress', { address: inbox.address })} className="overview__tool" aria-label={t('dissolve.copyAddress', { address: inbox.address })} onClick={(event) => void copyWithToast(inbox.address, undefined, event.currentTarget)}>
            <IconCopy aria-hidden="true" />
          </TipButton>
          {!inbox.ended && status.connected && (
            <TipButton
              tip={blocked ? t('dissolve.extendUsed', { used: inbox.extensions?.used ?? 0, limit: inbox.extensions?.limit ?? 0, plan: status.limits.plan ?? '' }) : t('dissolve.extend')}
              className="overview__tool"
              aria-label={t('dissolve.extend')}
              aria-disabled={blocked || undefined}
              onClick={blocked ? undefined : () => extend(inbox)}
            >
              <IconExtend aria-hidden="true" />
            </TipButton>
          )}
          <TipButton tip={inbox.ended ? t('dissolve.deleteHere') : t('dissolve.burn')} className="overview__tool overview__tool--danger" aria-label={`${inbox.ended ? t('dissolve.deleteHere') : t('dissolve.burn')} ${inbox.address}`} onClick={() => burn(inbox)}>
            <IconBurn aria-hidden="true" />
          </TipButton>
        </span>
      </div>
      </DissolveOut>
    )
  }

  return (
    <div className="overview">
      {live.length === 0 && ended.length === 0 ? (
        <p className="overview__empty">{status.connected ? t('overview.none') : t('dissolve.notConnected')}</p>
      ) : (
        <>
          <h2 className="overview__title">{t('overview.live', { count: live.length })}</h2>
          {live.length === 0 ? <p className="overview__empty">{t('overview.noneLive')}</p> : <ul className="overview__rows">{live.map(row)}</ul>}
          {ended.length > 0 && (
            <>
              <h2 className="overview__title">{t('overview.kept', { count: ended.length })}</h2>
              <ul className="overview__rows">{ended.map(row)}</ul>
            </>
          )}
        </>
      )}
      <Confirm request={confirming} cancelLabel={t('actions.cancel')} onClose={() => setConfirming(null)} />
    </div>
  )
}
