import type { Message } from '../api/types'
import type { ListFilter, ListSort } from '../constants/ui'

const byText = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

/** The messages in the order the list's headers ask for. Ties fall back to newest first, so the order never jumps. */
export function sortMessages(messages: readonly Message[], sort: ListSort): Message[] {
  const newest = (a: Message, b: Message): number => b.receivedAt.localeCompare(a.receivedAt)
  const compare = (a: Message, b: Message): number => {
    if (sort.key === 'received') return -newest(a, b)
    if (sort.key === 'from') return byText.compare(a.fromName || a.from, b.fromName || b.from)
    return byText.compare(a.subject, b.subject)
  }
  const sign = sort.descending ? -1 : 1
  return [...messages].sort((a, b) => sign * compare(a, b) || newest(a, b))
}

/** The messages a filter keeps. */
export function filterMessages(messages: readonly Message[], filter: ListFilter): Message[] {
  const keep: Record<ListFilter, (message: Message) => boolean> = {
    all: () => true,
    unread: (message) => message.unread,
    read: (message) => !message.unread,
    starred: (message) => message.starred,
    tagged: (message) => message.tags.length > 0,
  }
  return messages.filter(keep[filter])
}

/** Midnight at the end of the day `date` falls in: every message received before it is from that day or earlier. */
export function endOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime()
}

/** The messages whose sender, addresses, subject, preview or tags hold every word of `query`, ignoring case. */
export function searchMessages(messages: readonly Message[], query: string): Message[] {
  const words = query.toLocaleLowerCase().split(/\s+/u).filter(Boolean)
  if (words.length === 0) return [...messages]
  return messages.filter((message) => {
    const haystack = [message.fromName, message.from, message.to, message.subject, message.preview, ...message.tags].join(' ').toLocaleLowerCase()
    return words.every((word) => haystack.includes(word))
  })
}

/** One message per conversation, the newest, in the order given; messages not yet linked stand alone. */
export function newestPerConversation(messages: readonly Message[]): Message[] {
  const newest = new Map<string, Message>()
  for (const message of messages) {
    const key = message.threadId ?? message.id
    const kept = newest.get(key)
    if (kept === undefined || message.receivedAt > kept.receivedAt) newest.set(key, message)
  }
  const keep = new Set([...newest.values()].map((message) => message.id))
  return messages.filter((message) => keep.has(message.id))
}
