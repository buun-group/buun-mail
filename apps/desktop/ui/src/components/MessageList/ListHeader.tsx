import { Fragment } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { SORT_KEYS } from '../../constants/ui'
import type { ListSort, SortKey } from '../../constants/ui'
import { IconCaretDown, IconCaretUp } from '../../icons'

/**
 * The list's column headers, From, Subject and Received, split by hairlines. Each sorts the list by its column;
 * choosing the one already in use turns the order round. Names sort A to Z first, dates newest first.
 */
export function ListHeader({ sort, onSort, details = false }: { sort: ListSort; onSort: (sort: ListSort) => void; details?: boolean }): ReactNode {
  const { t } = useTranslation('mail')
  const choose = (key: SortKey): void => onSort(key === sort.key ? { key, descending: !sort.descending } : { key, descending: key === 'received' })
  return (
    <div className="list-header" role="group" aria-label={t('list.columns.label')}>
      <span className="list-header__spacer" aria-hidden="true" />
      {SORT_KEYS.map((key) => {
        const column = t(`list.columns.${key}`)
        const active = sort.key === key
        const Caret = sort.descending ? IconCaretDown : IconCaretUp
        return (
          <Fragment key={key}>
          {details && key === 'received' && (
            <>
              <span className="list-header__column list-header__column--checks">{t('checks.label')}</span>
              <span className="list-header__column list-header__column--size">{t('checks.sizeColumn')}</span>
            </>
          )}
          <button
            type="button"
            className={`list-header__column list-header__column--${key}`}
            aria-pressed={active}
            aria-label={active ? t(sort.descending ? 'list.columns.descending' : 'list.columns.ascending', { column }) : t('list.columns.sortBy', { column })}
            onClick={() => choose(key)}
          >
            <span>{column}</span>
            {active && <Caret aria-hidden="true" className="list-header__caret" />}
          </button>
          </Fragment>
        )
      })}
    </div>
  )
}
