import { useCallback, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { LIST_FILTERS } from '../../constants/ui'
import type { JumpId, ListFilter } from '../../constants/ui'
import { IconFilter, JUMP_GLYPHS, IconInbox, IconJump, IconMarkRead, IconStar, IconTag, IconUnread } from '../../icons'
import { ContextMenu } from '../ContextMenu/ContextMenu'
import type { MenuRequest } from '../ContextMenu/ContextMenu'
import { Popover } from '../Popover/Popover'
import { TipButton } from '../Tooltip/TipButton'

const FILTER_GLYPHS = { all: IconInbox, unread: IconUnread, read: IconMarkRead, starred: IconStar, tagged: IconTag } as const satisfies Record<ListFilter, unknown>

/** The dates Jump to offers, each as how far back from today. */
const JUMPS: readonly { id: JumpId; back: (day: Date) => Date }[] = [
  { id: 'today', back: (day: Date) => day },
  { id: 'yesterday', back: (day: Date) => new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1) },
  { id: 'lastWeek', back: (day: Date) => new Date(day.getFullYear(), day.getMonth(), day.getDate() - 7) },
  { id: 'lastMonth', back: (day: Date) => new Date(day.getFullYear(), day.getMonth() - 1, day.getDate()) },
  { id: 'lastYear', back: (day: Date) => new Date(day.getFullYear() - 1, day.getMonth(), day.getDate()) },
]

/** Today as the date field writes it, `2026-11-19`, in local time. */
const todayValue = (): string => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

interface ListToolsProps {
  filter: ListFilter
  onFilter: (filter: ListFilter) => void
  /** Scrolls the list to the mail received on `day` or the nearest day before it. */
  onJump: (day: Date) => void
  /** Icons only, for the narrow list beside the reading pane. */
  compact: boolean
}

/** Jump to a date and Filter, beside the list's search. */
export function ListTools({ filter, onFilter, onJump, compact }: ListToolsProps): ReactNode {
  const { t } = useTranslation('mail')
  const [jumpFrom, setJumpFrom] = useState<HTMLElement | null>(null)
  const [menu, setMenu] = useState<MenuRequest | null>(null)
  const [day, setDay] = useState(todayValue)
  const closeJump = useCallback(() => setJumpFrom(null), [])
  const closeMenu = useCallback(() => setMenu(null), [])
  const FilterGlyph = filter === 'all' ? IconFilter : FILTER_GLYPHS[filter]

  const jump = (to: Date): void => {
    setJumpFrom(null)
    onJump(to)
  }

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const [year, month, date] = day.split('-').map(Number)
    if (year !== undefined && month !== undefined && date !== undefined) jump(new Date(year, month - 1, date))
  }

  return (
    <div className="list-tools">
      <TipButton
        tip={compact ? t('list.jump.button') : null}
        className="list-tools__button"
        aria-label={t('list.jump.button')}
        aria-haspopup="dialog"
        aria-expanded={jumpFrom !== null}
        onClick={(event) => setJumpFrom(jumpFrom === null ? event.currentTarget : null)}
      >
        <IconJump aria-hidden="true" />
        {!compact && <span>{t('list.jump.button')}</span>}
      </TipButton>
      <TipButton
        tip={compact ? t('list.filter.button') : null}
        className="list-tools__button"
        data-on={filter !== 'all'}
        aria-label={filter === 'all' ? t('list.filter.button') : `${t('list.filter.button')}: ${t(`list.filter.${filter}`)}`}
        aria-haspopup="menu"
        aria-expanded={menu !== null}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          setMenu({
            x: box.right - 208,
            y: box.bottom + 6,
            label: t('list.filter.label'),
            items: LIST_FILTERS.map((item) => ({ id: item, label: t(`list.filter.${item}`), glyph: FILTER_GLYPHS[item], checked: item === filter, onSelect: () => onFilter(item) })),
          })
        }}
      >
        <FilterGlyph aria-hidden="true" />
        {!compact && <span>{filter === 'all' ? t('list.filter.button') : t(`list.filter.${filter}`)}</span>}
      </TipButton>
      {jumpFrom !== null && (
        <Popover anchor={jumpFrom} label={t('list.jump.label')} onClose={closeJump}>
          <div className="jump">
            {JUMPS.map((item) => {
              const Glyph = JUMP_GLYPHS[item.id]
              return (
                <button key={item.id} type="button" className="context-menu__item" onClick={() => jump(item.back(new Date()))}>
                  <Glyph aria-hidden="true" />
                  <span className="context-menu__words">{t(`list.jump.${item.id}`)}</span>
                </button>
              )
            })}
            <form className="jump__date" onSubmit={submit}>
              <label className="jump__field">
                <span className="visually-hidden">{t('list.jump.date')}</span>
                <input type="date" value={day} max={todayValue()} onChange={(event) => setDay(event.target.value)} required />
              </label>
              <button type="submit" className="jump__go">
                {t('list.jump.go')}
              </button>
            </form>
          </div>
        </Popover>
      )}
      {menu !== null && <ContextMenu request={menu} onClose={closeMenu} />}
    </div>
  )
}
