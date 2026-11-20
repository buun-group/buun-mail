import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { cancelReminder, cancelScheduled, listReminders, listScheduled, sendScheduledNow } from '../../api/client'
import type { Reminder, ScheduledMessage } from '../../api/types'
import { IconCalendar, IconClose, IconSend, IconSnooze } from '../../icons'
import { toast } from '../../lib/feedback'
import { formatFull } from '../../lib/time'
import { TipButton } from '../Tooltip/TipButton'

import './Scheduled.css'
import { Skeleton } from '../Busy/Skeleton'

const reason = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause))

/**
 * What is on the clock: messages scheduled to go, each with when, Send now and Cancel (and why its last try failed);
 * then sent messages waiting for a reply, each with when you will be reminded and Cancel.
 */
export function ScheduledList(): ReactNode {
  const { t } = useTranslation('mail')
  const [scheduled, setScheduled] = useState<ScheduledMessage[] | null>(null)
  const [reminders, setReminders] = useState<Reminder[]>([])

  useEffect(() => {
    void listScheduled().then(setScheduled)
    void listReminders().then(setReminders)
  }, [])

  if (scheduled === null) return <section className="scheduled"><Skeleton rows={3} label={t('later.loading')} /></section>
  return (
    <section className="scheduled" aria-label={t('views.scheduled')}>
      <header className="scheduled__head">
        <IconCalendar aria-hidden="true" />
        <h1>{t('views.scheduled')}</h1>
      </header>
      <h2 className="scheduled__title">{t('later.sending', { count: scheduled.length })}</h2>
      {scheduled.length === 0 ? (
        <p className="scheduled__empty">{t('later.noneSending')}</p>
      ) : (
        <ul className="scheduled__rows">
          {scheduled.map((item) => (
            <li key={item.id} className="scheduled__row">
              <IconSend aria-hidden="true" className="scheduled__glyph" />
              <span className="scheduled__what">
                <span className="scheduled__subject">{item.subject || t('later.noSubject')}</span>
                <span className="scheduled__who">{t('later.toFrom', { to: item.to.join(', '), from: item.from })}</span>
                {item.problem !== null && <span className="scheduled__problem">{item.problem}</span>}
              </span>
              <span className="scheduled__when">{formatFull(item.sendAt)}</span>
              <TipButton
                tip={t('later.sendNow')}
                className="scheduled__tool"
                aria-label={t('later.sendNowLabel', { subject: item.subject })}
                onClick={() =>
                  void sendScheduledNow(item.id)
                    .then((list) => {
                      setScheduled(list)
                      toast({ text: t('later.sent'), detail: item.subject, tone: 'done', glyph: IconSend })
                    })
                    .catch((cause: unknown) => toast({ text: t('later.notSent'), detail: reason(cause), tone: 'problem' }))
                }
              >
                <IconSend aria-hidden="true" />
              </TipButton>
              <TipButton tip={t('later.cancel')} className="scheduled__tool" aria-label={t('later.cancelLabel', { subject: item.subject })} onClick={() => void cancelScheduled(item.id).then(setScheduled)}>
                <IconClose aria-hidden="true" />
              </TipButton>
            </li>
          ))}
        </ul>
      )}
      <h2 className="scheduled__title">{t('later.waiting', { count: reminders.length })}</h2>
      {reminders.length === 0 ? (
        <p className="scheduled__empty">{t('later.noneWaiting')}</p>
      ) : (
        <ul className="scheduled__rows">
          {reminders.map((item) => (
            <li key={item.id} className="scheduled__row">
              <IconSnooze aria-hidden="true" className="scheduled__glyph" />
              <span className="scheduled__what">
                <span className="scheduled__subject">{item.subject || t('later.noSubject')}</span>
                <span className="scheduled__who">{t('later.to', { to: item.to })}</span>
              </span>
              <span className="scheduled__when">{t('later.remindAt', { when: formatFull(item.dueAt) })}</span>
              <TipButton tip={t('later.cancel')} className="scheduled__tool" aria-label={t('later.cancelReminder', { subject: item.subject })} onClick={() => void cancelReminder(item.id).then(setReminders)}>
                <IconClose aria-hidden="true" />
              </TipButton>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
