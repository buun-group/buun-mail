import { useEffect, useState } from 'react'

import { listMessages, listWorkspaces } from '../api/client'
import type { Message, Place, Workspace } from '../api/types'

export interface Mailbox {
  workspaces: Workspace[]
  place: Place | null
  messages: Message[]
  selected: Message | null
  error: string | null
  open: (place: Place) => void
  select: (message: Message) => void
}

/** Loads the workspaces once, then the messages of whichever folder is open. Opens the first inbox to start. */
export function useMailbox(): Mailbox {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [place, setPlace] = useState<Place | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listWorkspaces()
      .then((found) => {
        setWorkspaces(found)
        const first = found[0]
        if (first !== undefined) setPlace({ workspace: first.id, folder: null })
      })
      .catch((reason: unknown) => setError(String(reason)))
  }, [])

  useEffect(() => {
    if (place === null) return
    let current = true
    listMessages(place)
      .then((found) => {
        if (!current) return
        setMessages(found)
        setSelectedId(null)
      })
      .catch((reason: unknown) => setError(String(reason)))
    return () => {
      current = false
    }
  }, [place])

  return {
    workspaces,
    place,
    messages,
    selected: messages.find((message) => message.id === selectedId) ?? null,
    error,
    open: setPlace,
    select: (message) => setSelectedId(message.id),
  }
}
