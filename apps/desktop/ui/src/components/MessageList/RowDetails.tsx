import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { Authentication, Message } from '../../api/types'
import i18n from '../../i18n'
import { IconCheck, IconCheckFail, IconCheckNone, IconCheckUnclear } from '../../icons'
import { domainOf } from '../../lib/sending'
import { readableSize } from '../../lib/size'
import { TipSpan } from '../Tooltip/TipButton'

const CHECKS = ['spf', 'dkim', 'dmarc'] as const
type CheckName = (typeof CHECKS)[number]
type CheckState = NonNullable<Authentication['spf']> | 'none'

const GLYPHS = { pass: IconCheck, fail: IconCheckFail, other: IconCheckUnclear, none: IconCheckNone } as const satisfies Record<CheckState, unknown>

/** Each check's state, `none` when the receiving server did not record it. */
function stateOf(checks: Authentication | null, name: CheckName): CheckState {
  return checks?.[name] ?? 'none'
}

/** A row's sender checks and size in words, for the row's accessible name and for tests. */
export function rowDetailsLabel(message: Message): string {
  const parts = CHECKS.map((name) => `${name.toUpperCase()} ${i18n.t(`mail:auth.${stateOf(message.checks, name)}`)}`)
  if (message.size !== null) parts.push(readableSize(message.size))
  return parts.join(', ')
}

/**
 * SPF, DKIM and DMARC as a glyph and the check's name each, green tick for passed, a cross for failed, a question for
 * unclear and a dash when not recorded, each with a tip that says what it means for this sender; then the size.
 */
export function RowDetails({ message }: { message: Message }): ReactNode {
  const { t } = useTranslation('mail')
  const domain = domainOf(message.from)
  return (
    <span className="row-details" aria-hidden="true">
      <span className="row-details__checks">
        {CHECKS.map((name) => {
          const state = stateOf(message.checks, name)
          const Glyph = GLYPHS[state]
          return (
            <TipSpan key={name} tip={t(`checks.${name}.${state}`, { domain })} className="row-details__check" side="above">
              <span data-state={state} className="row-details__chip">
                <Glyph />
                {name.toUpperCase()}
              </span>
            </TipSpan>
          )
        })}
      </span>
      {message.size !== null && (
        <TipSpan tip={t('checks.size', { bytes: message.size.toLocaleString() })} className="row-details__size" side="above">
          <span>{readableSize(message.size)}</span>
        </TipSpan>
      )}
    </span>
  )
}
