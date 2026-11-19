import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { Compose } from '../../hooks/useCompose'
import { IconCompose, IconDelete } from '../../icons'
import { formatListed } from '../../lib/time'

/** Saved drafts, newest first, in place of the message list: one opens the compose window, its glyph deletes it. */
export function DraftsList({ compose }: { compose: Compose }): ReactNode {
  const { t } = useTranslation('compose')
  return (
    <section className="message-list" aria-label={t('drafts.title')}>
      <header className="message-list__header">
        <div className="message-list__title">
          <IconCompose aria-hidden="true" className="message-list__glyph" />
          <h1>{t('drafts.title')}</h1>
        </div>
        <span className="message-list__tally">{compose.drafts.length}</span>
      </header>
      {compose.waiting > 0 && <p className="drafts__waiting">{t('drafts.waiting', { count: compose.waiting })}</p>}
      {compose.drafts.length === 0 ? (
        <p className="message-list__empty">{t('drafts.empty')}</p>
      ) : (
        <ul className="message-list__rows">
          {compose.drafts.map((item) => {
            const who = [...item.draft.to, ...item.draft.cc].map((person) => person.name ?? person.address).join(', ')
            return (
              <li key={item.id}>
                <button type="button" className="message-row message-row--draft" onClick={() => compose.resume(item.id)}>
                  <span className="message-row__from">{who === '' ? t('drafts.nobody') : t('drafts.to', { who })}</span>
                  <time className="message-row__time" dateTime={item.updatedAt}>
                    {formatListed(item.updatedAt)}
                  </time>
                  <span className="message-row__subject">
                    <span className="message-row__subject-text">{item.draft.subject || t('noSubject')}</span>
                  </span>
                  <span className="message-row__preview">{item.draft.text.trim().split('\n')[0]}</span>
                </button>
                <button type="button" className="drafts__delete" aria-label={t('drafts.delete')} onClick={() => compose.deleteDraft(item.id)}>
                  <IconDelete aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
