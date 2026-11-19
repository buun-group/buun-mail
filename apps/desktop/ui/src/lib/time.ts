/** A day in milliseconds. */
const DAY_MS = 86_400_000

/**
 * When a message arrived, as the list shows it: the time today, "Yesterday", then the date. Local time, the reader's
 * own locale.
 */
export function formatReceived(iso: string, now: Date = new Date()): string {
  const received = new Date(iso)
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (received.getTime() >= startOfToday) return received.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  if (received.getTime() >= startOfToday - DAY_MS) return 'Yesterday'
  return received.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** The full date and time, for the reader. */
export function formatFull(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
