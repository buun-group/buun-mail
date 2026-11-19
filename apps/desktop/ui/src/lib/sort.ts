import type { Message } from '../api/types'
import type { ListSort } from '../constants/ui'

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
