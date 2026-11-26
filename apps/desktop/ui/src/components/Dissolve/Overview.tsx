import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { burnDissolveInbox, deleteDissolveIdentity, dissolveIdentities, dissolveStatus, extendDissolveInbox, updateDissolveIdentity } from '../../api/client'
import type { DissolveIdentityRow, DissolveInbox, DissolveStatus, Place, Workspace } from '../../api/types'
import { IconBurn, IconCopy, IconDelete, IconExtend, IconFolder, IconIdentity, IconRename, IconTimer, IconUnread } from '../../icons'
import { Popover } from '../Popover/Popover'
import { copyWithToast } from '../../lib/copy'
import { DISSOLVE_WORKSPACE, formatTimeLeft, timeLeft } from '../../lib/dissolve'
import { toast } from '../../lib/feedback'
import { formatListed } from '../../lib/time'
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
    const lifetimeReached = inbox.extensions?.lifetimeReached === true && inbox.extensions.lifetimeEndsAt !== null
    const blocked = lifetimeReached || inbox.extensions?.canExtend === false
    const blockedTip = lifetimeReached
      ? t('dissolve.lifetimeReached', { time: formatListed(inbox.extensions?.lifetimeEndsAt ?? '') })
      : t('dissolve.extendUsed', { used: inbox.extensions?.used ?? 0, limit: inbox.extensions?.limit ?? 0, plan: status.limits.plan ?? '' })
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
              tip={blocked ? blockedTip : t('dissolve.extend')}
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
      {status.connected && status.identities.plan === true && status.identities.granted && <IdentityList now={now} inboxes={status.inboxes} onOpen={onOpen} />}
      <Confirm request={confirming} cancelLabel={t('actions.cancel')} onClose={() => setConfirming(null)} />
    </div>
  )
}

/**
 * Every agent identity on the account (Pro and Business, once allowed for Buun Mail): its address, label and time
 * left, with Rename, Extend and Delete (the identity only; its inbox and mail stay). One whose inbox is a folder here
 * opens it.
 */
function IdentityList({ now, inboxes, onOpen }: { now: number; inboxes: DissolveInbox[]; onOpen: (place: Place) => void }): ReactNode {
  const { t } = useTranslation('mail')
  const [rows, setRows] = useState<DissolveIdentityRow[] | null>(null)
  const [renaming, setRenaming] = useState<{ row: DissolveIdentityRow; anchor: HTMLElement } | null>(null)
  const [confirming, setConfirming] = useState<Confirmation | null>(null)

  useEffect(() => {
    let live = true
    dissolveIdentities()
      .then((found) => {
        if (live) setRows(found)
      })
      .catch(() => {
        if (live) setRows([])
      })
    return () => {
      live = false
    }
  }, [])

  const extend = (row: DissolveIdentityRow): void => {
    updateDissolveIdentity(row.id, { extend: true })
      .then((next) => {
        setRows(next)
        toast({ text: t('identityList.extended'), detail: row.email, tone: 'done' })
      })
      .catch((cause: unknown) => toast({ text: t('identityList.failed'), detail: reason(cause), tone: 'problem' }))
  }
  const remove = (row: DissolveIdentityRow): void =>
    setConfirming({
      title: t('identityList.deleteTitle', { email: row.email }),
      body: t('identityList.deleteBody'),
      action: t('identityList.delete'),
      run: () => {
        deleteDissolveIdentity(row.id)
          .then((next) => {
            setRows(next)
            toast({ text: t('identityList.deleted'), detail: row.email, tone: 'done', glyph: IconIdentity })
          })
          .catch((cause: unknown) => toast({ text: t('identityList.failed'), detail: reason(cause), tone: 'problem' }))
      },
    })

  if (rows === null) return <Skeleton rows={2} label={t('identityList.loading')} />
  return (
    <>
      <h2 className="overview__title">{t('identityList.title', { count: rows.length })}</h2>
      {rows.length === 0 ? (
        <p className="overview__empty">{t('identityList.none')}</p>
      ) : (
        <ul className="overview__rows">
          {rows.map((row) => {
            const folder = inboxes.find((inbox) => inbox.id === row.inbox)?.address ?? null
            const left = row.expiresAt === null ? null : timeLeft(row.expiresAt, now)
            return (
              <li key={row.id}>
                <div className="overview__row">
                  <button type="button" className="overview__open" disabled={folder === null} aria-label={t('identityList.open', { email: row.email })} onClick={folder === null ? undefined : () => onOpen({ workspace: DISSOLVE_WORKSPACE, folder })}>
                    <IconIdentity aria-hidden="true" className="overview__glyph" />
                    <span className="overview__who">
                      <span className="overview__address">{row.email}</span>
                      <span className="overview__name">{row.label ?? (folder === null ? t('identityList.elsewhere') : t('identityList.noLabel'))}</span>
                    </span>
                    {left !== null && (
                      <span className="overview__left" data-soon={left.soon}>
                        <IconTimer aria-hidden="true" />
                        {formatTimeLeft(left)}
                      </span>
                    )}
                  </button>
                  <span className="overview__tools">
                    <TipButton tip={t('identityList.rename')} className="overview__tool" aria-label={t('identityList.rename')} onClick={(event) => setRenaming({ row, anchor: event.currentTarget })}>
                      <IconRename aria-hidden="true" />
                    </TipButton>
                    <TipButton tip={t('identityList.extend')} className="overview__tool" aria-label={t('identityList.extend')} onClick={() => extend(row)}>
                      <IconExtend aria-hidden="true" />
                    </TipButton>
                    <TipButton tip={t('identityList.delete')} className="overview__tool overview__tool--danger" aria-label={`${t('identityList.delete')} ${row.email}`} onClick={() => remove(row)}>
                      <IconDelete aria-hidden="true" />
                    </TipButton>
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {renaming !== null && <RenameIdentity row={renaming.row} anchor={renaming.anchor} onDone={setRows} onClose={() => setRenaming(null)} />}
      <Confirm request={confirming} cancelLabel={t('actions.cancel')} onClose={() => setConfirming(null)} />
    </>
  )
}

/** A label for an agent identity, saved on dissolve.email; its expiry stays where it was. */
function RenameIdentity({ row, anchor, onDone, onClose }: { row: DissolveIdentityRow; anchor: HTMLElement; onDone: (rows: DissolveIdentityRow[]) => void; onClose: () => void }): ReactNode {
  const { t } = useTranslation('mail')
  const [label, setLabel] = useState(row.label ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    updateDissolveIdentity(row.id, { label: label.trim() })
      .then((next) => {
        onDone(next)
        toast({ text: t('identityList.saved'), detail: row.email, tone: 'done' })
        onClose()
      })
      .catch((cause: unknown) => setError(reason(cause)))
      .finally(() => setBusy(false))
  }
  return (
    <Popover anchor={anchor} label={t('identityList.renameTitle', { email: row.email })} onClose={onClose}>
      <form className="new-address" onSubmit={save}>
        <label className="new-address__field" htmlFor="identity-label">
          {t('identityList.renameTitle', { email: row.email })}
        </label>
        <div className="new-address__address new-address__address--wide">
          <input id="identity-label" value={label} placeholder={t('identityList.labelPlaceholder')} onChange={(event) => setLabel(event.target.value)} autoComplete="off" />
        </div>
        {error !== null && (
          <p role="alert" className="new-address__error">
            {error}
          </p>
        )}
        <button type="submit" className="new-address__make" disabled={busy}>
          {t('identityList.save')}
        </button>
      </form>
    </Popover>
  )
}
