/** The times Snooze offers, nearest first. */
export const SNOOZE_CHOICES = ['laterToday', 'tomorrow', 'weekend', 'nextWeek'] as const
export type SnoozeChoice = (typeof SNOOZE_CHOICES)[number]

/** The hour a morning choice comes back at, and how far ahead Later today looks. */
const MORNING = 8
const LATER_HOURS = 3

/**
 * When each choice comes back, from `now`: Later today in three hours on the hour (tomorrow morning when that would be
 * after six in the evening), Tomorrow at eight, This weekend on Saturday at nine (next Saturday when it is already the
 * weekend), Next week on Monday at eight.
 */
export function snoozeTime(choice: SnoozeChoice, now: Date = new Date()): Date {
  const at = (days: number, hour: number): Date => new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, hour, 0, 0, 0)
  if (choice === 'laterToday') {
    const later = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + LATER_HOURS, 0, 0, 0)
    return later.getHours() >= 18 || later.getDate() !== now.getDate() ? at(1, MORNING) : later
  }
  if (choice === 'tomorrow') return at(1, MORNING)
  const day = now.getDay()
  if (choice === 'weekend') return at(day === 6 ? 7 : day === 0 ? 6 : 6 - day, 9)
  return at(((8 - day) % 7) || 7, MORNING)
}
