import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { listContacts } from '../../api/client'
import type { Contact, KnownContact } from '../../api/types'
import type { Theme } from '../../constants/ui'
import { IconCompose, IconContacts, IconCopy, IconSearch } from '../../icons'
import { copyWithToast } from '../../lib/copy'
import { formatListed } from '../../lib/time'
import { Avatar } from '../Avatar/Avatar'
import { TipButton } from '../Tooltip/TipButton'

import './Contacts.css'

interface ContactsListProps {
  theme: Theme
  /** Whether anything can send, so Write is on. */
  canWrite: boolean
  /** Starts a new message to this person. */
  onWrite: (contact: Contact) => void
  /** Shows every message with this person, by searching all mail for their address. */
  onShowMail: (address: string) => void
}

/**
 * Everyone this mailbox knows, in place of the message list: who has written to you and whom you have written to, most
 * messages first, with how many and the latest. A click shows their mail; each can be written to or copied.
 */
export function ContactsList({ theme, canWrite, onWrite, onShowMail }: ContactsListProps): ReactNode {
  const { t } = useTranslation('mail')
  const [query, setQuery] = useState('')
  const [people, setPeople] = useState<KnownContact[] | null>(null)

  useEffect(() => {
    let current = true
    const timer = window.setTimeout(() => {
      listContacts(query.trim())
        .then((found) => {
          if (current) setPeople(found)
        })
        .catch(() => setPeople([]))
    }, 150)
    return () => {
      current = false
      window.clearTimeout(timer)
    }
  }, [query])

  return (
    <section className="message-list contacts" aria-label={t('contacts.title')}>
      <header className="message-list__header">
        <div className="message-list__title">
          <IconContacts aria-hidden="true" className="message-list__glyph" />
          <h1>{t('contacts.title')}</h1>
        </div>
        <span className="message-list__tally">{people?.length ?? ''}</span>
        <label className="message-list__search contacts__search">
          <IconSearch aria-hidden="true" />
          <span className="visually-hidden">{t('contacts.search')}</span>
          <input type="search" placeholder={t('contacts.search')} value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" spellCheck={false} />
        </label>
      </header>
      {people !== null && people.length === 0 ? (
        <p className="message-list__empty">{query.trim() === '' ? t('contacts.empty') : t('contacts.noMatch', { query: query.trim() })}</p>
      ) : (
        <ul className="message-list__rows">
          {(people ?? []).map((person) => {
            const who = person.name ?? person.address
            return (
              <li key={person.address} className="contact">
                <button type="button" className="contact__main" aria-label={t('contacts.showMail', { who })} onClick={() => onShowMail(person.address)}>
                  <Avatar name={person.name ?? ''} address={person.address} theme={theme} />
                  <span className="contact__words">
                    <span className="contact__name">{who}</span>
                    {person.name !== null && <span className="contact__address">{person.address}</span>}
                  </span>
                  <span className="contact__counts">
                    <span>{t('contacts.messages', { count: person.messages })}</span>
                    <span>{t('contacts.latest', { when: formatListed(person.latest) })}</span>
                  </span>
                </button>
                <span className="contact__tools">
                  <TipButton tip={canWrite ? t('contacts.write', { who }) : t('contacts.writeNeedsSending', { who })} className="contact__tool" aria-disabled={!canWrite || undefined} aria-label={t('contacts.write', { who })} onClick={canWrite ? () => onWrite({ name: person.name, address: person.address }) : undefined}>
                    <IconCompose aria-hidden="true" />
                  </TipButton>
                  <TipButton tip={t('contacts.copy', { address: person.address })} className="contact__tool" aria-label={t('contacts.copy', { address: person.address })} onClick={(event) => void copyWithToast(person.address, undefined, event.currentTarget)}>
                    <IconCopy aria-hidden="true" />
                  </TipButton>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
