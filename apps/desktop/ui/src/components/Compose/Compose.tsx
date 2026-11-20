import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { isTauri } from '@tauri-apps/api/core'

import { pickFilesToSend } from '../../api/client'
import type { Contact, Sendable, Workspace } from '../../api/types'
import type { Compose as ComposeApi } from '../../hooks/useCompose'
import { IconAttachment, IconCalendar, IconClose, IconDelete, IconMinimize, IconRestore, IconSend } from '../../icons'
import { toast } from '../../lib/feedback'
import { readableSize } from '../../lib/size'
import { contactLine, fromChoices, isAddress } from '../../lib/compose'
import { canSendAs, domainOf } from '../../lib/sending'
import { Select } from '../Select/Select'
import { SnoozePicker } from '../Snooze/SnoozePicker'
import { TipButton } from '../Tooltip/TipButton'
import { RecipientField } from './RecipientField'

import './Compose.css'

/** The From choice that lets the person type any address on a sendable domain. */
const OTHER = '__other__'

interface ComposeProps {
  compose: ComposeApi
  workspaces: readonly Workspace[]
  sendable: readonly Sendable[]
}

/**
 * The compose window: a panel at the foot of the window that stays open beside the mail, so the original can be read
 * while answering. From offers the addresses a connected sender can send as; To, Cc and Bcc take chips; Ctrl or Cmd
 * Enter sends. Every change is saved as a draft.
 */
export function Compose({ compose, workspaces, sendable }: ComposeProps): ReactNode {
  const { t } = useTranslation('compose')
  const open = compose.open
  const body = useRef<HTMLTextAreaElement | null>(null)
  const [showCc, setShowCc] = useState(false)
  const [showBcc, setShowBcc] = useState(false)
  const [laterFrom, setLaterFrom] = useState<HTMLElement | null>(null)
  const [typingFrom, setTypingFrom] = useState(false)
  const [openedFor, setOpenedFor] = useState<string | null>(null)

  // A newly opened message starts with Cc shown when it has some, and the cursor at the top of the text.
  if ((open?.id ?? null) !== openedFor) {
    setOpenedFor(open?.id ?? null)
    setShowCc((open?.draft.cc.length ?? 0) > 0)
    setShowBcc((open?.draft.bcc.length ?? 0) > 0)
    setTypingFrom(false)
  }
  useEffect(() => {
    if (openedFor === null) return
    const area = body.current
    if (area === null) return
    area.focus()
    area.setSelectionRange(0, 0)
    area.scrollTop = 0
  }, [openedFor])

  // Ctrl or Cmd Enter sends from anywhere in the panel; it reads the latest state when pressed.
  const sendIfReady = useRef<() => void>(() => {})
  const attach = useCallback((element: HTMLElement | null) => {
    if (element === null) return undefined
    const onKey = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault()
        sendIfReady.current()
      }
    }
    element.addEventListener('keydown', onKey)
    return () => element.removeEventListener('keydown', onKey)
  }, [])

  useLayoutEffect(() => {
    sendIfReady.current = () => {
      const current = compose.open?.draft
      if (current === undefined) return
      const ok = isAddress(current.from.address) && canSendAs(current.from.address, sendable) && current.to.length + current.cc.length + current.bcc.length > 0
      if (ok) compose.send()
    }
  })

  if (open === null) return null
  const draft = open.draft
  const set = (change: Partial<typeof draft>): void => compose.change({ ...draft, ...change })
  const choices = fromChoices(workspaces, sendable, null)
  if (draft.from.address !== '' && !choices.some((choice) => choice.address === draft.from.address) && isAddress(draft.from.address)) choices.unshift(draft.from)
  const fromOk = isAddress(draft.from.address) && canSendAs(draft.from.address, sendable)
  const files = draft.attachments ?? []
  const totalSize = files.reduce((sum, file) => sum + file.size, 0)
  const tooLarge = totalSize > 35 * 1024 * 1024
  const ready = fromOk && draft.to.length + draft.cc.length + draft.bcc.length > 0 && !tooLarge
  const title = t(`title.${open.mode}`)

  if (compose.minimized) {
    return (
      <section className="compose compose--min" aria-label={t('label')}>
        <button type="button" className="compose__bar" onClick={() => compose.setMinimized(false)}>
          <span className="compose__title">{draft.subject || title}</span>
          <IconRestore aria-hidden="true" />
          <span className="visually-hidden">{t('restore')}</span>
        </button>
      </section>
    )
  }

  return (
    <section ref={attach} className="compose" aria-label={t('label')}>
      <header className="compose__head">
        <h2 className="compose__title">{title}</h2>
        <button type="button" className="compose__icon" aria-label={t('minimize')} onClick={() => compose.setMinimized(true)}>
          <IconMinimize aria-hidden="true" />
        </button>
        <button type="button" className="compose__icon" aria-label={t('close')} onClick={() => compose.setMinimized(true)}>
          <IconClose aria-hidden="true" />
        </button>
      </header>

      <div className="compose__fields">
        <div className="compose__row">
          <label htmlFor="compose-from" className="compose__label">
            {t('fields.from')}
          </label>
          {typingFrom || choices.length === 0 ? (
            <input
              id="compose-from"
              className="compose__input"
              value={draft.from.address}
              placeholder={sendable[0] === undefined ? '' : `you@${sendable[0].domain}`}
              onChange={(event) => set({ from: { name: workspaces.find((workspace) => workspace.addresses.includes(`*@${domainOf(event.target.value)}`))?.name ?? null, address: event.target.value.trim().toLowerCase() } })}
              autoComplete="off"
              spellCheck={false}
              aria-describedby="compose-from-hint"
            />
          ) : (
            <Select
              id="compose-from"
              className="select--wide"
              value={draft.from.address}
              options={[...choices.map((choice: Contact) => ({ value: choice.address, label: contactLine(choice) })), { value: OTHER, label: t('fromOther') }]}
              onChange={(value) => {
                if (value === OTHER) {
                  setTypingFrom(true)
                  set({ from: { name: null, address: sendable[0] === undefined ? '' : `@${sendable[0].domain}` } })
                  return
                }
                const choice = choices.find((item) => item.address === value)
                if (choice !== undefined) set({ from: choice })
              }}
            />
          )}
        </div>
        {(typingFrom || choices.length === 0) && (
          <p id="compose-from-hint" className={fromOk || draft.from.address === '' ? 'compose__hint' : 'compose__hint compose__hint--problem'}>
            {fromOk || !isAddress(draft.from.address) ? t('fromOtherHint', { domains: sendable.map((known) => known.domain).join(', ') }) : t('fromNotSendable', { domain: domainOf(draft.from.address) })}
          </p>
        )}

        <div className="compose__row compose__row--recipients">
          <RecipientField id="compose-to" label={t('fields.to')} people={draft.to} onChange={(to) => set({ to })} />
          <div className="compose__toggles">
            {!showCc && (
              <button type="button" onClick={() => setShowCc(true)}>
                {t('addCc')}
              </button>
            )}
            {!showBcc && (
              <button type="button" onClick={() => setShowBcc(true)}>
                {t('addBcc')}
              </button>
            )}
          </div>
        </div>
        {showCc && (
          <div className="compose__row compose__row--recipients">
            <RecipientField id="compose-cc" label={t('fields.cc')} people={draft.cc} onChange={(cc) => set({ cc })} />
          </div>
        )}
        {showBcc && (
          <div className="compose__row compose__row--recipients">
            <RecipientField id="compose-bcc" label={t('fields.bcc')} people={draft.bcc} onChange={(bcc) => set({ bcc })} />
          </div>
        )}
        <div className="compose__row">
          <label htmlFor="compose-subject" className="compose__label">
            {t('fields.subject')}
          </label>
          <input id="compose-subject" className="compose__input" value={draft.subject} placeholder={t('subjectPlaceholder')} onChange={(event) => set({ subject: event.target.value })} autoComplete="off" />
        </div>
      </div>

      <label htmlFor="compose-body" className="visually-hidden">
        {t('fields.body')}
      </label>
      <textarea ref={body} id="compose-body" className="compose__body" value={draft.text} onChange={(event) => set({ text: event.target.value })} spellCheck />

      {files.length > 0 && (
        <ul className="compose__files" aria-label={t('files', { count: files.length })}>
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="compose__file">
              <IconAttachment aria-hidden="true" />
              <span className="compose__file-name">{file.name}</span>
              <span className="compose__file-size">{readableSize(file.size)}</span>
              <button type="button" className="recipient__remove" aria-label={t('removeFile', { name: file.name })} onClick={() => set({ attachments: files.filter((_, at) => at !== index) })}>
                <IconClose aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {tooLarge && (
        <p role="alert" className="compose__error">
          {t('tooLarge', { size: readableSize(totalSize) })}
        </p>
      )}
      {compose.error !== null && (
        <p role="alert" className="compose__error">
          {compose.error}
        </p>
      )}

      <footer className="compose__foot">
        <button type="button" className="compose__send" disabled={!ready} aria-describedby="compose-send-hint" onClick={compose.send}>
          <IconSend aria-hidden="true" />
          {t('send')}
        </button>
        <TipButton tip={t('sendLater')} className="compose__icon" aria-label={t('sendLater')} aria-disabled={!ready || undefined} onClick={ready ? (event) => setLaterFrom(event.currentTarget) : undefined}>
          <IconCalendar aria-hidden="true" />
        </TipButton>
        <Select
          id="compose-remind"
          className="compose__remind"
          value={String(compose.open?.remindDays ?? '')}
          options={[
            { value: '', label: t('remindNone') },
            { value: '1', label: t('remind1') },
            { value: '3', label: t('remind3') },
            { value: '7', label: t('remind7') },
          ]}
          onChange={(value) => compose.setRemind(value === '' ? null : Number(value))}
        />
        {laterFrom !== null && (
          <SnoozePicker
            anchor={laterFrom}
            label={t('sendLaterLabel')}
            onClose={() => setLaterFrom(null)}
            onPick={(at) => {
              setLaterFrom(null)
              compose.sendLater(at)
            }}
          />
        )}
        <span id="compose-send-hint" className="compose__hint">
          {ready ? t('sendHint') : fromOk ? t('noRecipients') : ''}
        </span>
        <span className="compose__saved">{t('saved')}</span>
        <button
          type="button"
          className="compose__icon"
          aria-label={t('attach')}
          onClick={() =>
            void pickFilesToSend().then((picked) => {
              if (picked.length > 0) set({ attachments: [...files, ...picked] })
              else if (!isTauri()) toast({ text: t('attachDesktopOnly'), tone: 'info' })
            })
          }
        >
          <IconAttachment aria-hidden="true" />
        </button>
        <button type="button" className="compose__icon compose__icon--danger" aria-label={t('discard')} onClick={compose.discard}>
          <IconDelete aria-hidden="true" />
        </button>
      </footer>
    </section>
  )
}
