import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { IconType } from 'react-icons'
import { useTranslation } from 'react-i18next'

import { addDissolveIdentity, connectDissolve, dissolveIdentity, regenerateDissolveIdentity, revealSecret, revealStatus } from '../../api/client'
import type { DissolveIdentities, DissolveIdentity, DissolveInbox, DissolveStatus, Persona } from '../../api/types'
import { IconAddress, IconAt, IconBirthday, IconAdd, IconCheck, IconCollapseRight, IconCopy, IconHide, IconIdentity, IconInfo, IconPassword, IconPhone, IconRegenerate, IconShow, IconUsername } from '../../icons'
import { STORAGE_KEYS } from '../../constants/ui'
import { copyWithToast } from '../../lib/copy'
import { useNarrowWindow } from '../../hooks/useNarrowWindow'
import { useReaderSlot } from '../../lib/readerSlot'
import { toast } from '../../lib/feedback'
import { BusyButton } from '../Busy/BusyButton'
import { Skeleton } from '../Busy/Skeleton'
import { Confirm } from '../Confirm/Confirm'
import type { Confirmation } from '../Confirm/Confirm'
import { TipButton } from '../Tooltip/TipButton'

const reason = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause))

/** How long a shown password stays on screen before it hides itself. */
const SHOWN_MS = 30_000

/** Stands for the hidden password: asterisks, never its length. */
const HIDDEN = '************'

/** How long a row shows its tick after a copy. */
const COPIED_MS = 1_400

/** How far the pointer moves before pressing the tab becomes dragging it. */
const DRAG_PX = 4

/** Where the collapsed tab sits, as a share of the pane's height, 0.5 being the middle. */
function readTabY(): number {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEYS.identityTab))
    return Number.isFinite(stored) && stored > 0 && stored < 1 ? stored : 0.5
  } catch {
    return 0.5
  }
}

const clampY = (value: number): number => Math.min(0.92, Math.max(0.08, value))

/**
 * The collapsed drawer: a tab on the pane's right edge. A press opens the drawer; a drag moves the tab up or down,
 * and it stays where it was left. Arrow keys move it too, for the keyboard.
 */
function DrawerTab({ onOpen, label }: { onOpen: () => void; label: string }): ReactNode {
  const [y, setY] = useState(readTabY)
  const [dragging, setDragging] = useState(false)
  const press = useRef<{ startY: number; startShare: number; height: number; moved: boolean } | null>(null)

  const keep = (share: number): void => {
    try {
      localStorage.setItem(STORAGE_KEYS.identityTab, share.toFixed(3))
    } catch {
      // Without storage it starts in the middle next time.
    }
  }
  const down = (event: PointerEvent<HTMLButtonElement>): void => {
    const pane = event.currentTarget.offsetParent
    press.current = { startY: event.clientY, startShare: y, height: pane instanceof HTMLElement ? pane.clientHeight : window.innerHeight, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const move = (event: PointerEvent<HTMLButtonElement>): void => {
    const held = press.current
    if (held === null) return
    const delta = event.clientY - held.startY
    if (!held.moved && Math.abs(delta) < DRAG_PX) return
    held.moved = true
    setDragging(true)
    setY(clampY(held.startShare + delta / held.height))
  }
  const up = (): void => {
    const held = press.current
    press.current = null
    setDragging(false)
    if (held === null) return
    if (held.moved) keep(y)
    else onOpen()
  }
  const key = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const next = clampY(y + (event.key === 'ArrowUp' ? -0.05 : 0.05))
    setY(next)
    keep(next)
  }

  return (
    <button
      type="button"
      className="identity-drawer__tab"
      data-dragging={dragging}
      style={{ top: `${(y * 100).toFixed(1)}%` }}
      aria-label={label}
      aria-expanded="false"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => {
        press.current = null
        setDragging(false)
      }}
      onKeyDown={key}
      onClick={(event) => {
        // Pointer presses open from pointerup; this is the keyboard's Enter and Space.
        if (event.detail === 0) onOpen()
      }}
    >
      <IconIdentity aria-hidden="true" />
      <span className="identity-drawer__grip" aria-hidden="true" />
    </button>
  )
}

/** Two letters for the persona's badge. */
function initials(persona: Persona | null): string {
  if (persona === null) return ''
  return `${persona.firstName.charAt(0)}${persona.lastName.charAt(0)}`.toUpperCase()
}

/** A YYYY-MM-DD birthday in the reader's own words, such as 6 Oct 2006. */
function readableDate(iso: string): string {
  const at = Date.parse(`${iso}T12:00:00Z`)
  return Number.isNaN(at) ? iso : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(at)
}

/** One value: a row whose whole width copies it, with the copy glyph at the end to say so. */
/** True for a moment after a copy, so the row can show a tick where its copy glyph was. */
function useCopied(): [boolean, () => void] {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const mark = (): void => {
    setCopied(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), COPIED_MS)
  }
  return [copied, mark]
}

function Row({ glyph: Glyph, label, value, shown }: { glyph: IconType; label: string; value: string | null | undefined; shown?: string }): ReactNode {
  const { t } = useTranslation('mail')
  const [copied, markCopied] = useCopied()
  if (value === null || value === undefined || value === '') return null
  return (
    <button
      type="button"
      className="identity-card__row"
      data-copied={copied}
      aria-label={t('identity.copyField', { field: label })}
      onClick={(event) => {
        markCopied()
        void copyWithToast(value, t('identity.copied', { field: label }), event.currentTarget)
      }}
    >
      <Glyph className="identity-card__glyph" aria-hidden="true" />
      <span className="identity-card__text">
        <span className="identity-card__label">{label}</span>
        <span className="identity-card__value">{shown ?? value}</span>
      </span>
      {copied ? <IconCheck className="identity-card__copy identity-card__copy--done" aria-hidden="true" /> : <IconCopy className="identity-card__copy" aria-hidden="true" />}
    </button>
  )
}

/**
 * The password row: hidden until shown, and Copy works without showing it. Both read it from dissolve.email through
 * the reveal lock, asking for the reveal code inline first when one is set and reveals are not open.
 */
function PasswordRow({ inboxId }: { inboxId: string }): ReactNode {
  const { t } = useTranslation('mail')
  const [shown, setShown] = useState<string | null>(null)
  // What to do once the reveal code is in: show it, or copy it.
  const [asking, setAsking] = useState<'show' | 'copy' | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const codeInput = useRef<HTMLInputElement | null>(null)
  const copyButton = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (asking !== null) codeInput.current?.focus()
  }, [asking])
  useEffect(() => {
    if (shown === null) return undefined
    const timer = window.setTimeout(() => setShown(null), SHOWN_MS)
    return () => window.clearTimeout(timer)
  }, [shown])

  const fetchThen = (then: 'show' | 'copy', given: string | null): void => {
    revealSecret('identity', inboxId, given)
      .then((secret) => {
        setAsking(null)
        setCode('')
        setError(null)
        if (then === 'show') setShown(secret)
        else void copyWithToast(secret, t('identity.copied', { field: t('identity.password') }), copyButton.current ?? undefined)
      })
      .catch((cause: unknown) => setError(reason(cause)))
  }
  const start = (then: 'show' | 'copy'): void => {
    if (then === 'show' && shown !== null) {
      setShown(null)
      return
    }
    if (then === 'copy' && shown !== null) {
      void copyWithToast(shown, t('identity.copied', { field: t('identity.password') }), copyButton.current ?? undefined)
      return
    }
    void revealStatus().then((status) => {
      if (status.codeSet && status.openFor === 0) setAsking(then)
      else fetchThen(then, null)
    })
  }
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (asking !== null) fetchThen(asking, code)
  }

  return (
    <div className="identity-card__row identity-card__row--password">
      <IconPassword className="identity-card__glyph" aria-hidden="true" />
      <span className="identity-card__text">
        <span className="identity-card__label">{t('identity.password')}</span>
        <code className="identity-card__value identity-card__secret" aria-live="polite">
          {shown ?? HIDDEN}
        </code>
      </span>
      <span className="identity-card__tools">
        <TipButton tip={shown === null ? t('identity.show') : t('identity.hide')} className="identity-card__tool" aria-label={shown === null ? t('identity.showPassword') : t('identity.hidePassword')} onClick={() => start('show')}>
          {shown === null ? <IconShow aria-hidden="true" /> : <IconHide aria-hidden="true" />}
        </TipButton>
        <TipButton tip={t('identity.copyPassword')} className="identity-card__tool" aria-label={t('identity.copyPassword')} onClick={(event) => {
            copyButton.current = event.currentTarget
            start('copy')
          }}>
          <IconCopy aria-hidden="true" />
        </TipButton>
      </span>
      {asking !== null && (
        <form className="identity-card__code" onSubmit={submit}>
          <label htmlFor={`identity-code-${inboxId}`}>{t('identity.revealCode')}</label>
          <input id={`identity-code-${inboxId}`} type="password" autoComplete="off" value={code} onChange={(event) => setCode(event.target.value)} ref={codeInput} />
          <button type="submit" className="dissolve-bar__button">
            {t('identity.unlock')}
          </button>
        </form>
      )}
      {error !== null && (
        <p role="alert" className="identity-card__error">
          {error}
        </p>
      )}
    </div>
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
 * An address's agent identity in a drawer on the window's right edge, which collapses to a tab there. As the
 * dissolve.email app shows it: the made-up person's name and initials at the top,
 * then one row per value to copy with a click (email, password, username, birthday, phone, address). The password is
 * hidden until shown, goes through the reveal code when one is set, and is read from dissolve.email each time, never
 * kept here. Regenerate swaps in a new person and password after asking; an address without one can be given one.
 */
export function IdentityDrawer({
  inbox,
  identities,
  open,
  fresh = false,
  onToggle,
  onStatus,
}: {
  inbox: DissolveInbox
  identities: DissolveIdentities
  open: boolean
  /** Just made with a new address: the drawer glows for a moment so it is clear where the identity went. */
  fresh?: boolean
  onToggle: () => void
  onStatus: (status: DissolveStatus) => void
}): ReactNode {
  const { t } = useTranslation('mail')
  // undefined while loading, null when the address has none.
  const [loaded, setIdentity] = useState<DissolveIdentity | null | undefined>(undefined)
  const [problem, setProblem] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<Confirmation | null>(null)
  // Bumped after a regenerate, so the password row forgets a password it was showing.
  const [turn, setTurn] = useState(0)
  // Inside the reading pane, clear of the title bar and the list. With the pane hidden (the wide list), inside the
  // list instead, starting below its header and this bar, so it never covers the top of the window.
  const slot = useReaderSlot()
  // Read so the drawer moves between the pane and the list as the window crosses the narrow width.
  useNarrowWindow()
  // The wide list keeps the reader mounted but hidden, so a pane counts only while it is on screen.
  const pane = slot !== null && slot.getClientRects().length > 0 ? slot : null
  const list = pane === null ? document.querySelector<HTMLElement>('.message-list') : null
  const target = pane ?? list ?? document.body
  const below = list?.querySelector('.dissolve-banner')
  const top = list !== null && below instanceof HTMLElement ? below.getBoundingClientRect().bottom - list.getBoundingClientRect().top + 8 : null
  const place = top === null ? undefined : { top: `${Math.round(top)}px` }
  const drawerClass = `identity-drawer identity-card${pane === null && list === null ? ' identity-drawer--window' : ''}${fresh ? ' identity-drawer--fresh' : ''}`

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
  // Every value as labelled lines, for notes or a password manager. The password comes through the reveal lock like
  // anywhere else; while a reveal code is needed it is left out, and the toast says so.
  const copyAll = async (): Promise<void> => {
    if (identity == null) return
    const known = identity
    let password: string | null = null
    if (known.hasPassword) {
      const lock = await revealStatus()
      if (!(lock.codeSet && lock.openFor === 0)) password = await revealSecret('identity', inbox.id, null).catch(() => null)
    }
    const who = known.persona
    const lines: [string, string | null | undefined][] = [
      [t('identity.email'), known.email],
      [t('identity.password'), password],
      [t('identity.name'), who?.fullName],
      [t('identity.username'), who?.username],
      [t('identity.birthday'), who?.dateOfBirth],
      [t('identity.phone'), who?.phone],
      [t('identity.address'), who === null ? null : [who.address.street, who.address.city, [who.address.state, who.address.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')],
    ]
    const text = lines.filter((line): line is [string, string] => line[1] != null && line[1] !== '').map(([label, value]) => `${label}: ${value}`).join('\n')
    await copyWithToast(text, password === null && known.hasPassword ? t('identity.copiedAllNoPassword') : t('identity.copiedAll'))
  }

  const regenerate = (): void =>
    setConfirming({
      title: t('identity.regenerateTitle'),
      body: t('identity.regenerateBody'),
      action: t('identity.regenerate'),
      run: () => {
        regenerateDissolveIdentity(inbox.id)
          .then((renewed) => {
            setIdentity(renewed)
            setTurn((value) => value + 1)
            toast({ text: t('identity.regenerated'), detail: inbox.address, tone: 'done', glyph: IconRegenerate })
          })
          .catch((cause: unknown) => toast({ text: t('identity.regenerateFailed'), detail: reason(cause), tone: 'problem' }))
      },
    })

  // Until identities are allowed for Buun Mail, dissolve.email will not show one, so there is nothing to read.
  const identity = identities.granted ? loaded : null
  const persona = identity?.persona ?? null
  const address = persona === null ? null : [persona.address.street, persona.address.city, [persona.address.state, persona.address.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const collapse = (
    <TipButton tip={t('identity.collapse')} className="identity-card__tool" aria-label={t('identity.collapse')} aria-expanded="true" onClick={onToggle}>
      <IconCollapseRight aria-hidden="true" />
    </TipButton>
  )
  // Collapsed, a tab on the window's right edge brings it back.
  if (!open) {
    return createPortal(<DrawerTab label={t('identity.expand')} onOpen={onToggle} />, target)
  }

  if (problem !== null || identity === undefined || identity === null) {
    let words: ReactNode
    if (problem !== null) words = <p role="alert" className="identity-card__error">{problem}</p>
    else if (identity === undefined) words = <Skeleton label={t('identity.loading')} />
    else words = <p className="identity-card__note">{identities.plan === false ? t('identity.notOnPlan') : identities.granted ? t('identity.none') : t('identity.notAllowedYet')}</p>
    return createPortal(
      <aside className={drawerClass} style={place} aria-label={t('identity.title')}>
        <header className="identity-card__head">
          <span className="identity-card__badge" aria-hidden="true">
            <IconIdentity />
          </span>
          <div className="identity-card__who">
            <h3>{t('identity.title')}</h3>
            <span>{inbox.address}</span>
          </div>
          {collapse}
        </header>
        <div className="identity-card__empty">{words}
        {problem === null && identity === null && identities.plan !== false && !inbox.ended && (
          <BusyButton className="dissolve-bar__button" glyph={IconAdd} busyLabel={identities.granted ? t('identity.making') : t('identity.allowing')} run={identities.granted ? add : allow}>
            {identities.granted ? t('identity.make') : t('identity.allow')}
          </BusyButton>
        )}
        </div>
      </aside>,
      target,
    )
  }

  return createPortal(
    <aside className={drawerClass} style={place} aria-labelledby={`identity-${inbox.id}`}>
      <header className="identity-card__head">
        <span className="identity-card__badge" aria-hidden="true">
          {initials(persona) || <IconIdentity />}
        </span>
        <div className="identity-card__who">
          <h3 id={`identity-${inbox.id}`}>
            {persona === null ? (
              t('identity.title')
            ) : (
              <button type="button" className="identity-card__name" aria-label={t('identity.copyField', { field: t('identity.name') })} onClick={(event) => void copyWithToast(persona.fullName, t('identity.copied', { field: t('identity.name') }), event.currentTarget)}>
                {persona.fullName}
              </button>
            )}
          </h3>
          <span>{t('identity.title')}</span>
        </div>
        <TipButton tip={t('identity.copyAll')} className="identity-card__tool" aria-label={t('identity.copyAll')} onClick={() => void copyAll()}>
          <IconCopy aria-hidden="true" />
        </TipButton>
        {!inbox.ended && (
          <TipButton tip={t('identity.regenerate')} className="identity-card__tool" aria-label={t('identity.regenerate')} onClick={regenerate}>
            <IconRegenerate aria-hidden="true" />
          </TipButton>
        )}
        {collapse}
      </header>
      <div className="identity-card__rows">
        <Row glyph={IconAt} label={t('identity.email')} value={identity.email} />
        {identity.hasPassword ? <PasswordRow key={turn} inboxId={inbox.id} /> : <p className="identity-card__note identity-card__note--row">{t('identity.noPassword')}</p>}
        {persona !== null && (
          <>
            <Row glyph={IconUsername} label={t('identity.username')} value={persona.username} />
            <Row glyph={IconBirthday} label={t('identity.birthday')} value={persona.dateOfBirth} shown={readableDate(persona.dateOfBirth)} />
            <Row glyph={IconPhone} label={t('identity.phone')} value={persona.phone} />
            <Row glyph={IconAddress} label={t('identity.address')} value={address} />
          </>
        )}
      </div>
      <p className="identity-card__foot">
        <IconInfo aria-hidden="true" />
        {t('identity.madeUp')}
      </p>
      <Confirm request={confirming} cancelLabel={t('actions.cancel')} onClose={() => setConfirming(null)} />
    </aside>,
    target,
  )
}
