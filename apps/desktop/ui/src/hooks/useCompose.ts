import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cancelScheduled, remindIfNoReply, scheduleSend, sendMessage } from '../api/client'
import type { Contact, Draft, Message, SendFailure, Sendable, Workspace } from '../api/types'
import { STORAGE_KEYS } from '../constants/ui'
import { IconSend } from '../icons'
import type { ComposeMode, Composing, Original } from '../lib/compose'
import { forwardBlock, forwardSubject, fromChoices, quote, replyAllCc, replySubject, replyTarget, signatureFor, startingText } from '../lib/compose'
import { dismissFeedback, toast } from '../lib/feedback'
import { formatListed } from '../lib/time'
import { loadWriting, profileOf } from '../lib/writing'

/** How long Undo stays possible after Send, before the message really goes. */
export const UNDO_SEND_MS = 5_000

/** How often the outbox tries again while something waits in it. */
const RETRY_MS = 60_000

export interface Compose {
  /** The message being written, or null when no compose window is open. */
  open: Composing | null
  /** Why the last send was refused, shown in the compose window until it changes. */
  error: string | null
  minimized: boolean
  setMinimized: (minimized: boolean) => void
  /** Starts a new message, or a reply, reply all or forward of `original`. */
  start: (mode: ComposeMode, original: Original | null, to?: Contact[]) => void
  /** Opens a saved draft. */
  resume: (id: string) => void
  /** Saves a change to the open message as a draft. */
  change: (draft: Draft) => void
  /** Closes and forgets the open message, with Undo. */
  discard: () => void
  /** Sends the open message after a short Undo window. */
  send: () => void
  /** Schedules the open message to go at `at`, with Undo. */
  sendLater: (at: Date) => void
  /** Asks to be reminded if nobody answers the open message within `days` days, or not (null). */
  setRemind: (days: number | null) => void
  /** Every saved draft, newest first. */
  drafts: Composing[]
  /** Forgets one saved draft. */
  deleteDraft: (id: string) => void
  /** How many messages wait to be sent again. */
  waiting: number
}

function load<T>(key: string): T[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

function store(key: string, list: unknown[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list))
  } catch {
    // Storage can be off; drafts then last only while the app is open.
  }
}

const newId = (): string => `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const failureOf = (error: unknown): SendFailure => (typeof error === 'object' && error !== null && 'message' in error ? { retry: Boolean((error as SendFailure).retry), message: String((error as SendFailure).message) } : { retry: true, message: String(error) })

/**
 * Writing mail: one compose window at a time, saved as a draft as it changes; Send with a few seconds to Undo; and an
 * outbox that keeps a message Resend could not take (offline, busy) and tries again every minute and when the
 * computer comes back online. A refused message reopens with the reason.
 */
export function useCompose(workspaces: readonly Workspace[], sendable: readonly Sendable[], onSent: (message: Message) => void, currentWorkspace: string | null = null): Compose {
  const { t } = useTranslation('compose')
  const [open, setOpen] = useState<Composing | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [minimized, setMinimized] = useState(false)
  const [drafts, setDrafts] = useState<Composing[]>(() => load<Composing>(STORAGE_KEYS.drafts))
  const [outbox, setOutbox] = useState<Composing[]>(() => load<Composing>(STORAGE_KEYS.outbox))

  const saveDrafts = useCallback((next: (current: Composing[]) => Composing[]) => {
    setDrafts((current) => {
      const list = next(current)
      store(STORAGE_KEYS.drafts, list)
      return list
    })
  }, [])

  const saveOutbox = useCallback((next: (current: Composing[]) => Composing[]) => {
    setOutbox((current) => {
      const list = next(current)
      store(STORAGE_KEYS.outbox, list)
      return list
    })
  }, [])

  const show = (composing: Composing): void => {
    setOpen(composing)
    setError(null)
    setMinimized(false)
  }

  const start = (mode: ComposeMode, original: Original | null, to: Contact[] = []): void => {
    const choices = fromChoices(workspaces, sendable, original)
    // The workspace's own profile: its address for new mail, and its signature in place of the sender's.
    const profile = profileOf(original?.message.workspace ?? currentWorkspace)
    const preferred = original === null && profile !== undefined && profile.from !== '' ? choices.find((choice) => choice.address === profile.from) : undefined
    const from = preferred ?? choices[0] ?? { name: null, address: sendable[0] === undefined ? '' : `@${sendable[0].domain}` }
    const signature = profile !== undefined && profile.signature.trim() !== '' ? profile.signature : signatureFor(from.address, sendable)
    const carried =
      original === null ? '' : mode === 'forward' ? forwardBlock(original, { title: t('forward.title'), from: t('fields.from'), date: t('forward.date'), subject: t('fields.subject'), to: t('fields.to') }) : quote(original, (when, who) => t('quoteLine', { when, who }))
    const draft: Draft = {
      from,
      to: original === null || mode === 'forward' ? to : replyTarget(original),
      cc: original !== null && mode === 'replyAll' ? replyAllCc(original, from.address) : [],
      bcc: [],
      subject: original === null ? '' : mode === 'forward' ? forwardSubject(original.message.subject) : replySubject(original.message.subject),
      text: startingText(signature, carried),
      replyToMessage: original !== null && mode !== 'forward' ? original.message.id : null,
      attachments: original !== null && mode === 'forward' ? (original.attachments ?? []).filter((file) => !file.inline).map((file) => ({ name: file.name, size: file.size, fromMessage: [original.message.id, file.index] as [string, number] })) : [],
    }
    show({ id: newId(), mode, draft, updatedAt: new Date().toISOString() })
  }

  const change = (draft: Draft): void => {
    if (open === null) return
    const next = { ...open, draft, updatedAt: new Date().toISOString() }
    setOpen(next)
    setError(null)
    saveDrafts((current) => [next, ...current.filter((item) => item.id !== next.id)])
  }

  const deleteDraft = useCallback((id: string) => saveDrafts((current) => current.filter((item) => item.id !== id)), [saveDrafts])

  const discard = (): void => {
    if (open === null) return
    const gone = open
    setOpen(null)
    deleteDraft(gone.id)
    toast({
      text: t('discarded'),
      tone: 'done',
      undo: () => {
        show(gone)
        saveDrafts((current) => [gone, ...current])
      },
    })
  }

  // The latest outbox and callbacks, for the retry timer and the online listener.
  const latest = useRef({ outbox, onSent })
  useEffect(() => {
    latest.current = { outbox, onSent }
  })

  /** Hands one message to Resend now: Sent on success, the outbox on a failure worth retrying, back to the person on a refusal. */
  const deliver = useCallback(
    (composing: Composing, fromOutbox: boolean) => {
      sendMessage(composing.draft)
        .then((sent) => {
          if (fromOutbox) saveOutbox((current) => current.filter((item) => item.id !== composing.id))
          toast({ text: t('sent'), detail: composing.draft.to.map((person) => person.address).join(', '), tone: 'done', glyph: IconSend })
          latest.current.onSent(sent)
          if (composing.remindDays !== undefined) void remindIfNoReply(sent.id, composing.remindDays)
        })
        .catch((cause: unknown) => {
          const failure = failureOf(cause)
          if (failure.retry) {
            saveOutbox((current) => [composing, ...current.filter((item) => item.id !== composing.id)])
            if (!fromOutbox) toast({ text: t('queued'), detail: failure.message, tone: 'info' })
            return
          }
          if (fromOutbox) saveOutbox((current) => current.filter((item) => item.id !== composing.id))
          saveDrafts((current) => [composing, ...current.filter((item) => item.id !== composing.id)])
          setOpen(composing)
          setMinimized(false)
          setError(failure.message)
          toast({ text: t('refused'), detail: failure.message, tone: 'problem' })
        })
    },
    [saveDrafts, saveOutbox, t],
  )

  const send = (): void => {
    if (open === null) return
    const outgoing = open
    setOpen(null)
    deleteDraft(outgoing.id)
    let cancelled = false
    const timer = window.setTimeout(() => {
      dismissFeedback(sending)
      if (!cancelled) deliver(outgoing, false)
    }, UNDO_SEND_MS)
    const sending = toast({
      text: t('sending'),
      detail: outgoing.draft.subject || t('noSubject'),
      tone: 'info',
      glyph: IconSend,
      undo: () => {
        cancelled = true
        window.clearTimeout(timer)
        show(outgoing)
        saveDrafts((current) => [outgoing, ...current])
      },
    })
  }

  const sendLater = (at: Date): void => {
    if (open === null) return
    const outgoing = open
    scheduleSend(outgoing.draft, at, outgoing.remindDays ?? null)
      .then((list) => {
        setOpen(null)
        deleteDraft(outgoing.id)
        const scheduled = list.find((item) => item.subject === outgoing.draft.subject && Date.parse(item.sendAt) === Math.floor(at.getTime() / 1000) * 1000)
        toast({
          text: t('scheduled', { when: formatListed(at.toISOString()) }),
          detail: outgoing.draft.subject || t('noSubject'),
          tone: 'done',
          glyph: IconSend,
          ...(scheduled === undefined
            ? {}
            : {
                undo: () => {
                  void cancelScheduled(scheduled.id)
                  show(outgoing)
                  saveDrafts((current) => [outgoing, ...current])
                },
              }),
        })
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
  }

  const setRemind = (days: number | null): void => {
    setOpen((current) => {
      if (current === null) return current
      const { remindDays: _was, ...rest } = current
      return days === null ? rest : { ...rest, remindDays: days }
    })
  }

  // The templates and workspace profiles, read once so a new message can start from them at once.
  useEffect(() => {
    void loadWriting().catch(() => undefined)
  }, [])

  // Tries the outbox again every minute while it holds something, and the moment the computer is back online.
  useEffect(() => {
    if (outbox.length === 0) return
    const retry = (): void => latest.current.outbox.forEach((item) => deliver(item, true))
    const timer = window.setInterval(retry, RETRY_MS)
    window.addEventListener('online', retry)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('online', retry)
    }
  }, [outbox.length, deliver])

  return {
    open,
    error,
    minimized,
    setMinimized,
    start,
    resume: (id) => {
      const found = drafts.find((item) => item.id === id)
      if (found !== undefined) show(found)
    },
    change,
    discard,
    send,
    sendLater,
    setRemind,
    drafts,
    deleteDraft,
    waiting: outbox.length,
  }
}
