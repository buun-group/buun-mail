import i18n from '../i18n'

/** The workspace id dissolve.email's mail is stored under; matches `dissolve::WORKSPACE` in Rust. */
export const DISSOLVE_WORKSPACE = 'dissolve'

/** Under this many minutes left, an inbox reads as ending soon. */
const SOON_MINUTES = 60

/** How long an inbox has left. */
export interface TimeLeft {
  ended: boolean
  soon: boolean
  days: number
  hours: number
  minutes: number
}

/** What is left of an inbox that ends at `expiresAt`, at `now`. */
export function timeLeft(expiresAt: string, now: number = Date.now()): TimeLeft {
  const total = Math.floor((Date.parse(expiresAt) - now) / 60_000)
  if (!Number.isFinite(total) || total <= 0) return { ended: true, soon: true, days: 0, hours: 0, minutes: 0 }
  return { ended: false, soon: total < SOON_MINUTES, days: Math.floor(total / 1_440), hours: Math.floor((total % 1_440) / 60), minutes: Math.max(1, total % 60) }
}

/** Time left in words: "2 d 4 h left", "3 h 12 min left", "8 min left", or "Ended". */
export function formatTimeLeft(left: TimeLeft): string {
  if (left.ended) return i18n.t('mail:dissolve.ended')
  if (left.days > 0) return i18n.t('mail:dissolve.leftDays', { days: left.days, hours: left.hours })
  if (left.hours > 0) return i18n.t('mail:dissolve.leftHours', { hours: left.hours, minutes: left.minutes })
  return i18n.t('mail:dissolve.leftMinutes', { minutes: left.minutes })
}
