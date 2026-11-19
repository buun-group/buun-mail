import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { Authentication } from '../../api/types'
import { IconInfo, IconProblem, IconShield } from '../../icons'
import { domainOf } from '../../lib/sending'
import { TipButton } from '../Tooltip/TipButton'

/**
 * Whether the sender's domain stood behind the message, as the receiving server checked it: a shield for verified, a
 * warning for failed, a quiet note when unclear; the tip gives each check. Nothing when the message carries no results.
 */
export function SenderCheck({ authentication, from }: { authentication: Authentication | null; from: string }): ReactNode {
  const { t } = useTranslation('mail')
  if (authentication === null) return null
  const word = (check: Authentication['spf']): string => t(`auth.${check ?? 'none'}`)
  const checks = t('auth.detail', { spf: word(authentication.spf), dkim: word(authentication.dkim), dmarc: word(authentication.dmarc), by: authentication.by ?? t('auth.someone') })
  const lead = authentication.verdict === 'verified' ? t('auth.verifiedDetail', { domain: domainOf(from) }) : authentication.verdict === 'failed' ? t('auth.failedDetail') : ''
  const Glyph = authentication.verdict === 'verified' ? IconShield : authentication.verdict === 'failed' ? IconProblem : IconInfo
  return (
    <TipButton tip={`${lead} ${checks}`.trim()} className="sender-check" data-verdict={authentication.verdict} aria-label={`${t(`auth.${authentication.verdict}`)}. ${lead} ${checks}`.trim()}>
      <Glyph aria-hidden="true" />
      <span>{t(`auth.${authentication.verdict}`)}</span>
    </TipButton>
  )
}
