import { useCallback, useEffect, useState } from 'react'

import { listMessages, listWorkspaces, markAllRead, openMessage } from '../api/client'
import type { Message, MessageDetail, Place, Workspace } from '../api/types'

export interface Mailbox {
  workspaces: Workspace[]
  /** True once the workspaces have loaded. */
  ready: boolean
  place: Place | null
  messages: Message[]
  /** The open message with its text, or the summary alone while the text loads. */
  selected: { message: Message; body: string | null } | null
  error: string | null
  open: (place: Place) => void
  select: (message: Message) => void
  /** Opens a message's folder and the message, from a notification. */
  reveal: (message: Message) => void
  markAllRead: (place: Place, wholeWorkspace: boolean) => void
  /** Reloads the workspaces and the open folder, after an import or anything else that changes the store. */
  refresh: () => void
}

const message = (reason: unknown): string => (reason instanceof Error ? reason.message : String(reason))

/** Loads the workspaces, then the messages of whichever folder is open. Opens the first inbox to start. */
export function useMailbox(): Mailbox {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [ready, setReady] = useState(false)
  const [place, setPlace] = useState<Place | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [detail, setDetail] = useState<MessageDetail | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fail = useCallback((reason: unknown) => setError(message(reason)), [])

  const loadWorkspaces = useCallback(() => {
    listWorkspaces()
      .then((found) => {
        setWorkspaces(found)
        setReady(true)
        const first = found[0]
        setPlace((current) => current ?? (first === undefined ? null : { workspace: first.id, folder: null }))
      })
      .catch(fail)
  }, [fail])

  const loadMessages = useCallback(
    (target: Place, isCurrent: () => boolean = () => true) => {
      listMessages(target)
        .then((found) => {
          if (isCurrent()) setMessages(found)
        })
        .catch(fail)
    },
    [fail],
  )

  useEffect(loadWorkspaces, [loadWorkspaces])

  useEffect(() => {
    if (place === null) return
    let current = true
    loadMessages(place, () => current)
    return () => {
      current = false
    }
  }, [place, loadMessages])

  const refresh = useCallback(() => {
    loadWorkspaces()
    if (place !== null) loadMessages(place)
  }, [loadWorkspaces, loadMessages, place])

  const select = (picked: Message): void => {
    setSelectedId(picked.id)
    setDetail(null)
    openMessage(picked.id)
      .then((opened) => {
        setDetail(opened)
        // Read now: update the row in place, then the counts.
        setMessages((list) => list.map((item) => (item.id === opened.message.id ? opened.message : item)))
        if (picked.unread) refresh()
      })
      .catch(fail)
  }

  const selectedSummary = messages.find((item) => item.id === selectedId) ?? null

  return {
    workspaces,
    ready,
    place,
    messages,
    selected: selectedSummary === null ? null : { message: selectedSummary, body: detail?.message.id === selectedId ? detail.body : null },
    error,
    open: (next) => {
      setPlace(next)
      setSelectedId(null)
    },
    select,
    reveal: (target) => {
      setPlace({ workspace: target.workspace, folder: target.folder })
      select(target)
    },
    markAllRead: (target, wholeWorkspace) => {
      markAllRead(target, wholeWorkspace)
        .then(refresh)
        .catch(fail)
    },
    refresh,
  }
}
