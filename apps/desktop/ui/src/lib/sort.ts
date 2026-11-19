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
