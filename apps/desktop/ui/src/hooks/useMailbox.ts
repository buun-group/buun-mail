import { useCallback, useEffect, useMemo, useState } from 'react'

import { listMessages, listTags, listView, listWorkspaces, markAllRead, openMessage, tagMessage, untagMessage } from '../api/client'
import { onMailChanged } from '../api/events'
import type { MailView, Message, MessageDetail, Place, Workspace } from '../api/types'
import type { ListFilter, ListSort } from '../constants/ui'
import { filterMessages, sortMessages } from '../lib/sort'

export interface Mailbox {
  workspaces: Workspace[]
  /** Every tag in use, most used first, offered when tagging. */
  tags: string[]
  /** True once the workspaces have loaded. */
  ready: boolean
  place: Place | null
  /** A list across every workspace, shown instead of `place` while set. */
  view: MailView | null
  /** The open list, in `sort` order. */
  messages: Message[]
  sort: ListSort
  setSort: (sort: ListSort) => void
  /** What the list is narrowed to. */
  filter: ListFilter
  setFilter: (filter: ListFilter) => void
  /** How many messages the open list holds before the filter. */
  total: number
  /** The open message with its text, or the summary alone while the text loads. */
  selected: { message: Message; body: string | null } | null
  error: string | null
  open: (place: Place) => void
  openView: (view: MailView) => void
  select: (message: Message) => void
  /** Closes the open message, back to the list. */
  close: () => void
  /** Puts changed messages back in the list where they are, without a reload. */
  update: (changed: Message[]) => void
  /** Before a message leaves the list, opens the one after it (or before it), when it was the open one. */
  stepPast: (id: string) => void
  /** Opens a message's folder and the message, from a notification. */
  reveal: (message: Message) => void
  markAllRead: (place: Place, wholeWorkspace: boolean) => void
  /** Reloads the workspaces and the open folder, after an import or anything else that changes the store. */
  refresh: () => void
  /** Adds a tag to the open message. */
  addTag: (id: string, tag: string) => void
  /** Removes a tag from the open message. */
  removeTag: (id: string, tag: string) => void
}

const message = (reason: unknown): string => (reason instanceof Error ? reason.message : String(reason))

/** Loads the workspaces, then the messages of whichever folder is open. Opens the first inbox to start. */
export function useMailbox(): Mailbox {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [ready, setReady] = useState(false)
  const [place, setPlace] = useState<Place | null>(null)
  const [view, setView] = useState<MailView | null>(null)
  const [loaded, setMessages] = useState<Message[]>([])
  const [sort, setSort] = useState<ListSort>({ key: 'received', descending: true })
  const [filter, setFilter] = useState<ListFilter>('all')
  const messages = useMemo(() => sortMessages(filterMessages(loaded, filter), sort), [loaded, filter, sort])
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
    listTags()
      .then((found) => setTags(found.map((item) => item.tag)))
      .catch(() => setTags([]))
  }, [fail])

  const loadMessages = useCallback(
    (target: Place | MailView, isCurrent: () => boolean = () => true) => {
      ;(typeof target === 'string' ? listView(target) : listMessages(target))
        .then((found) => {
          if (isCurrent()) setMessages(found)
        })
        .catch(fail)
    },
    [fail],
  )

  useEffect(loadWorkspaces, [loadWorkspaces])

  const showing = view ?? place

  useEffect(() => {
    if (showing === null) return
    let current = true
    loadMessages(showing, () => current)
    return () => {
      current = false
    }
  }, [showing, loadMessages])

  const refresh = useCallback(() => {
    loadWorkspaces()
    if (showing !== null) loadMessages(showing)
  }, [loadWorkspaces, loadMessages, showing])

  // An agent or a rule changed something under the window: reload what is on screen.
  useEffect(() => onMailChanged(refresh), [refresh])

  const update = (changed: Message[]): void => {
    const byId = new Map(changed.map((item) => [item.id, item]))
    setMessages((list) => list.map((item) => byId.get(item.id) ?? item))
  }
  const replace = (updated: Message): void => update([updated])

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

  const stepPast = (id: string): void => {
    if (selectedId !== id) return
    const at = messages.findIndex((item) => item.id === id)
    const next = messages[at + 1] ?? messages[at - 1]
    if (next === undefined) setSelectedId(null)
    else select(next)
  }

  return {
    workspaces,
    tags,
    ready,
    place,
    view,
    messages,
    sort,
    setSort,
    filter,
    setFilter,
    total: loaded.length,
    selected: selectedSummary === null ? null : { message: selectedSummary, body: detail?.message.id === selectedId ? detail.body : null },
    error,
    open: (next) => {
      setPlace(next)
      setView(null)
      setSelectedId(null)
    },
    openView: (next) => {
      setView(next)
      setSelectedId(null)
    },
    select,
    close: () => setSelectedId(null),
    update,
    stepPast,
    reveal: (target) => {
      setPlace({ workspace: target.workspace, folder: target.folder })
      setView(null)
      select(target)
    },
    markAllRead: (target, wholeWorkspace) => {
      markAllRead(target, wholeWorkspace)
        .then(refresh)
        .catch(fail)
    },
    refresh,
    addTag: (id, tag) => {
      tagMessage(id, [tag])
        .then((updated) => {
          replace(updated)
          setTags((current) => (current.includes(tag) ? current : [...current, tag]))
        })
        .catch(fail)
    },
    removeTag: (id, tag) => {
      untagMessage(id, tag).then(replace).catch(fail)
    },
  }
}
