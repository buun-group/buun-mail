import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { openExternal } from '../../api/client'
import { IconCode, IconCopy, IconExternal, IconLink } from '../../icons'
import { copyWithToast } from '../../lib/copy'
import { extractVerification, SUBJECT_KEYWORDS, VERIFICATION_SENDER } from '../../lib/verification'

/** A code is offered from this confidence up: labelled, prefixed, emphasised or spaced, never a lone number. */
const CODE_CONFIDENCE = 0.8

/** A labelled code ("verification code is"), certain enough to show without any other sign. */
const LABELLED_CONFIDENCE = 0.93

/** A link is offered from this confidence up: its address or its words say it verifies. */
const LINK_CONFIDENCE = 0.85

/** The host a link opens, shown so a look-alike address is plain before it is opened. */
function hostOf(url: string): string | null {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.host : null
  } catch {
    return null
  }
}

/**
 * The verification code or sign-in link a message carries, with Copy and Open, above its body. Only confident finds
 * show; a link shows the host it opens, and only web links are offered.
 */
export function Verification({ subject, from, text, html }: { subject: string; from: string; text: string | null; html: string | null }): ReactNode {
  const { t } = useTranslation('mail')
  const found = useMemo(() => extractVerification({ subject, fromAddress: from, bodyText: text, bodyHtml: html }), [subject, from, text, html])
  // A labelled code ("your code is 482913") always shows. A weaker find (a bold or prefixed number) can be an invoice or
  // order number (INV-2026-11), so it shows only when the subject or sender says the mail is about verifying.
  const context = SUBJECT_KEYWORDS.test(subject) || VERIFICATION_SENDER.test(from)
  const code = found.find((match) => match.type === 'code' && (match.confidence >= LABELLED_CONFIDENCE || (context && match.confidence >= CODE_CONFIDENCE)))
  const link = found.find((match) => match.type === 'link' && match.confidence >= LINK_CONFIDENCE && hostOf(match.value) !== null)
  if (code === undefined && link === undefined) return null
  return (
    <div className="verification" role="group" aria-label={t('verification.label')}>
      {code !== undefined && (
        <div className="verification__row">
          <IconCode aria-hidden="true" className="verification__glyph" />
          <span className="verification__what">{t('verification.code')}</span>
          <code className="verification__code">{code.value}</code>
          <button type="button" className="verification__button" onClick={(event) => void copyWithToast(code.value, t('verification.codeCopied'), event.currentTarget)}>
            <IconCopy aria-hidden="true" />
            {t('verification.copy')}
          </button>
        </div>
      )}
      {link !== undefined && (
        <div className="verification__row">
          <IconLink aria-hidden="true" className="verification__glyph" />
          <span className="verification__what">{t('verification.link')}</span>
          <span className="verification__host">{hostOf(link.value)}</span>
          <button type="button" className="verification__button" onClick={() => void openExternal(link.value)}>
            <IconExternal aria-hidden="true" />
            {t('verification.open')}
          </button>
          <button type="button" className="verification__button" onClick={(event) => void copyWithToast(link.value, undefined, event.currentTarget)}>
            <IconCopy aria-hidden="true" />
            {t('verification.copy')}
          </button>
        </div>
      )}
    </div>
  )
}
