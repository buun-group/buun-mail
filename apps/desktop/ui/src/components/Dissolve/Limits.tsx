import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { IconType } from 'react-icons'

import { openExternal } from '../../api/client'
import type { DissolveLimits, Meter } from '../../api/types'
import { IconExternal, IconGauge, IconInboxes, IconLifetime, IconName, IconNewInbox, IconRequests, IconExtend } from '../../icons'
import { formatMinutes, readMeter } from '../../lib/dissolve'
import { formatListed } from '../../lib/time'

/** Where dissolve.email's plans are compared. */
const PLANS_URL = 'https://dissolve.email/pricing'

interface Row {
  id: string
  Glyph: IconType
  label: string
  meter?: Meter
  value?: string
  hint?: string | undefined
}

/** One row: the glyph and words, the value, a thin bar when the count and limit are both known, and a hint. */
function LimitRow({ row }: { row: Row }): ReactNode {
  const reading = row.meter === undefined ? null : readMeter(row.meter)
  return (
    <li className="limits__row" data-full={reading?.full ?? false}>
      <row.Glyph aria-hidden="true" className="limits__glyph" />
      <span className="limits__label">{row.label}</span>
      <span className="limits__value">{reading?.value ?? row.value}</span>
      {reading?.share != null && (
        <span className="limits__bar" aria-hidden="true">
          <span style={{ inlineSize: `${Math.round(reading.share * 100)}%` }} />
        </span>
      )}
      {row.hint !== undefined && <span className="limits__hint">{row.hint}</span>}
    </li>
  )
}

/**
 * The dissolve.email plan's limits and what is used of them: live inboxes, new inboxes this hour, API calls and message
 * checks a minute, how long an inbox lives, extensions, and choosing the name. Counts dissolve.email does not report
 * yet say so rather than guess. On the free plan, a link to compare plans.
 */
export function Limits({ limits }: { limits: DissolveLimits }): ReactNode {
  const { t } = useTranslation('mail')
  const hourly = limits.hourlyCreations
  const resets = (meter: Meter): string | undefined => (meter.resetAt === null ? undefined : t('limits.resets', { time: formatListed(meter.resetAt) }))
  const rows: Row[] = [
    { id: 'inboxes', Glyph: IconInboxes, label: t('limits.inboxes'), meter: limits.inboxes },
    { id: 'hourly', Glyph: IconNewInbox, label: t('limits.hourly'), meter: hourly, hint: resets(hourly) ?? (hourly.used === null && hourly.limit !== null && hourly.limit >= 0 ? t('limits.hourlyHint') : undefined) },
    { id: 'requests', Glyph: IconRequests, label: t('limits.requests'), meter: limits.requests, hint: t('limits.requestsHint') },
    { id: 'checks', Glyph: IconGauge, label: t('limits.checks'), meter: limits.messageChecks, hint: t('limits.checksHint') },
    {
      id: 'lifetime',
      Glyph: IconLifetime,
      label: t('limits.lifetime'),
      value: limits.inboxMinutes === null ? t('limits.notReported') : formatMinutes(limits.inboxMinutes),
      hint: limits.lifetimeMinutes === null ? undefined : t('limits.lifetimeHint', { time: formatMinutes(limits.lifetimeMinutes) }),
    },
    { id: 'extensions', Glyph: IconExtend, label: t('limits.extensions'), meter: { used: null, limit: limits.extensionsPerInbox, resetAt: null } },
    { id: 'names', Glyph: IconName, label: t('limits.names'), value: limits.customNames === null ? t('limits.notReported') : limits.customNames ? t('limits.yes') : t('limits.paidOnly') },
  ]
  return (
    <section className="limits" aria-labelledby="dissolve-limits">
      <div className="limits__head">
        <h5 id="dissolve-limits" className="settings__label">
          {limits.plan === null ? t('limits.title') : t('limits.plan', { plan: limits.plan.charAt(0).toUpperCase() + limits.plan.slice(1) })}
        </h5>
        {limits.plan === 'free' && (
          <button type="button" className="limits__plans" onClick={() => void openExternal(PLANS_URL)}>
            {t('limits.comparePlans')}
            <IconExternal aria-hidden="true" />
          </button>
        )}
      </div>
      <ul className="limits__rows">
        {rows.map((row) => (
          <LimitRow key={row.id} row={row} />
        ))}
      </ul>
    </section>
  )
}
