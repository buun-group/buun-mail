import i18n, { dateLocale } from '../i18n'

/** A day in milliseconds. */
const DAY_MS = 86_400_000

/**
 * When a message arrived, as the list shows it: the time today, "Yesterday", then the date. Local time, in the
 * language the app speaks, in the computer's regional format.
 */
export function formatReceived(iso: string, now: Date = new Date()): string {
  const received = new Date(iso)
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (received.getTime() >= startOfToday) return received.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })
  if (received.getTime() >= startOfToday - DAY_MS) return i18n.t('common:time.yesterday')
  return received.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })
}

/**
 * When a message arrived, as the list shows it: always the date, with the time for this year's mail (`19 Nov, 10:40
 * pm`), and the year instead for older mail (`19 Nov 2025`). Local time, in the computer's regional format.
 */
export function formatListed(iso: string, now: Date = new Date()): string {
  const received = new Date(iso)
  if (received.getFullYear() !== now.getFullYear()) return received.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' })
  return received.toLocaleString(dateLocale(), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

/** The full date and time, for the reader. */
export function formatFull(iso: string): string {
  return new Date(iso).toLocaleString(dateLocale(), { dateStyle: 'medium', timeStyle: 'short' })
}
