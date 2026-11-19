import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { IconCalendar, JUMP_GLYPHS } from '../../icons'
import { SNOOZE_CHOICES, snoozeTime } from '../../lib/snooze'
import type { SnoozeChoice } from '../../lib/snooze'
import { formatListed } from '../../lib/time'
import { Popover } from '../Popover/Popover'

import './Snooze.css'

const GLYPHS: Record<SnoozeChoice, (typeof JUMP_GLYPHS)[keyof typeof JUMP_GLYPHS]> = { laterToday: JUMP_GLYPHS.yesterday, tomorrow: JUMP_GLYPHS.today, weekend: JUMP_GLYPHS.lastWeek, nextWeek: JUMP_GLYPHS.lastMonth }

/** A date and time an hour from now, as the field writes it, local time. */
function soonValue(): string {
  const soon = new Date(Date.now() + 60 * 60 * 1000)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}T${pad(soon.getHours())}:${pad(soon.getMinutes())}`
}

/** Where a snooze can end: four common times, each with when it lands, or a date and time of the person's choosing. */
export function SnoozePicker({ anchor, onPick, onClose }: { anchor: HTMLElement; onPick: (until: Date) => void; onClose: () => void }): ReactNode {
  const { t } = useTranslation('mail')
  const [when, setWhen] = useState(soonValue)
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const picked = new Date(when)
    if (!Number.isNaN(picked.getTime()) && picked.getTime() > Date.now()) onPick(picked)
  }
  return (
    <Popover anchor={anchor} label={t('snooze.label')} onClose={onClose}>
      <div className="jump">
        {SNOOZE_CHOICES.map((choice) => {
          const Glyph = GLYPHS[choice]
          const at = snoozeTime(choice)
          return (
            <button key={choice} type="button" className="context-menu__item snooze__choice" onClick={() => onPick(at)}>
              <Glyph aria-hidden="true" />
              <span className="context-menu__words">{t(`snooze.${choice}`)}</span>
              <span className="snooze__when">{formatListed(at.toISOString())}</span>
            </button>
          )
        })}
        <form className="jump__date" onSubmit={submit}>
          <label className="jump__field">
            <IconCalendar aria-hidden="true" />
            <span className="visually-hidden">{t('snooze.pick')}</span>
            <input type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} required />
          </label>
          <button type="submit" className="jump__go">
            {t('snooze.go')}
          </button>
        </form>
      </div>
    </Popover>
  )
}
