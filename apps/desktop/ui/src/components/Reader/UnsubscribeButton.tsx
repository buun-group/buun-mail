import { useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { openExternal, sendMessage, unsubscribeOneClick } from '../../api/client'
import type { Message, Unsubscribe } from '../../api/types'
import { IconUnsubscribe } from '../../icons'
import { toast } from '../../lib/feedback'
import { domainOf } from '../../lib/sending'
import { TipButton } from '../Tooltip/TipButton'

const reason = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause))

/**
 * Leaves the mailing list a message came from, the quickest way the list allows: one click where it takes a one-click
 * POST (nothing opens), otherwise its unsubscribe page in the browser, otherwise the email it asks for, sent from the
 * address the message came to. Shown only when the message says how to leave.
 */
export function UnsubscribeButton({ message, unsubscribe, canSend }: { message: Message; unsubscribe: Unsubscribe; canSend: boolean }): ReactNode {
  const { t } = useTranslation('mail')
  const [done, setDone] = useState(false)
  const list = domainOf(message.from)
  const leave = (): void => {
    if (unsubscribe.oneClick) {
      unsubscribeOneClick(message.id)
        .then(() => {
          setDone(true)
          toast({ text: t('unsubscribe.done'), detail: t('unsubscribe.doneDetail', { list }), tone: 'done', glyph: IconUnsubscribe })
        })
        .catch((cause: unknown) => toast({ text: t('unsubscribe.failed'), detail: reason(cause), tone: 'problem' }))
      return
    }
    if (unsubscribe.web !== null) {
      void openExternal(unsubscribe.web).then(() => toast({ text: t('unsubscribe.opened'), detail: t('unsubscribe.openedDetail', { list }), tone: 'done' }))
      return
    }
    if (unsubscribe.mailTo === null) return
    if (!canSend) {
      void openExternal(`mailto:${unsubscribe.mailTo}?subject=${encodeURIComponent(unsubscribe.mailSubject ?? 'unsubscribe')}`)
      return
    }
    sendMessage({ from: { name: null, address: message.to }, to: [{ name: null, address: unsubscribe.mailTo }], cc: [], bcc: [], subject: unsubscribe.mailSubject ?? 'unsubscribe', text: unsubscribe.mailBody ?? '', replyToMessage: null, attachments: [] })
      .then(() => {
        setDone(true)
        toast({ text: t('unsubscribe.mailed'), detail: unsubscribe.mailTo ?? '', tone: 'done', glyph: IconUnsubscribe })
      })
      .catch((cause: unknown) => toast({ text: t('unsubscribe.failed'), detail: reason(cause), tone: 'problem' }))
  }
  return (
    <TipButton tip={t('unsubscribe.tip', { list })} className="sender-check unsubscribe" aria-disabled={done || undefined} onClick={done ? undefined : leave}>
      <IconUnsubscribe aria-hidden="true" />
      <span>{done ? t('unsubscribe.done') : t('unsubscribe.label')}</span>
    </TipButton>
  )
}
