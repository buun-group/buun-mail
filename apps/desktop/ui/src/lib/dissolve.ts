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

/** A meter in words, how full it is, and whether it is used up. */
export interface MeterReading {
  value: string
  /** Used over limit, 0 to 1, when both are known and the limit is finite. */
  share: number | null
  full: boolean
}

/** "2 of 5", "5 allowed", "Unlimited", or "Not reported" for a count against a limit. */
export function readMeter(meter: { used: number | null; limit: number | null }): MeterReading {
  const { used, limit } = meter
  if (limit !== null && limit < 0) return { value: used === null ? i18n.t('mail:limits.unlimited') : i18n.t('mail:limits.usedUnlimited', { used }), share: null, full: false }
  if (limit === null) return { value: used === null ? i18n.t('mail:limits.notReported') : String(used), share: null, full: false }
  if (used === null) return { value: i18n.t('mail:limits.allowed', { count: limit }), share: null, full: false }
  return { value: i18n.t('mail:limits.of', { used, limit }), share: limit === 0 ? 1 : Math.min(1, used / limit), full: used >= limit }
}

/** Minutes in words: "10 min", "1 h 30 min", "7 d". */
export function formatMinutes(minutes: number): string {
  if (minutes >= 1_440 && minutes % 1_440 === 0) return i18n.t('mail:limits.days', { count: minutes / 1_440 })
  if (minutes >= 60) return minutes % 60 === 0 ? i18n.t('mail:limits.hours', { count: minutes / 60 }) : i18n.t('mail:limits.hoursMinutes', { hours: Math.floor(minutes / 60), minutes: minutes % 60 })
  return i18n.t('mail:limits.minutes', { count: minutes })
}
