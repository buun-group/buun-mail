import { useEffect, useId, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { suggestContacts } from '../../api/client'
import type { Contact } from '../../api/types'
import { IconClose } from '../../icons'
import { parseContact } from '../../lib/compose'

/** How long typing pauses before suggestions are asked for. */
const SUGGEST_DELAY_MS = 150

interface RecipientFieldProps {
  id: string
  label: string
  people: Contact[]
  onChange: (people: Contact[]) => void
}

/**
 * Recipients as chips. Typing suggests people this mailbox knows; Enter, Tab, a comma or leaving the field turns what
 * was typed into a chip, Backspace in an empty field removes the last one, and a pasted list becomes several chips.
 */
export function RecipientField({ id, label, people, onChange }: RecipientFieldProps): ReactNode {
  const { t } = useTranslation('compose')
  const listId = useId()
  const [typed, setTyped] = useState('')
  const [suggestions, setSuggestions] = useState<Contact[]>([])
  const [active, setActive] = useState(0)

  useEffect(() => {
    const query = typed.trim()
    if (query.length < 1) return
    const timer = window.setTimeout(() => {
      suggestContacts(query)
        .then((found) => {
          setSuggestions(found.filter((contact) => !people.some((person) => person.address === contact.address)))
          setActive(0)
        })
        .catch(() => setSuggestions([]))
    }, SUGGEST_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [typed, people])

  const add = (found: Contact[]): void => {
    const fresh = found.filter((contact, index) => !people.some((person) => person.address === contact.address) && found.findIndex((other) => other.address === contact.address) === index)
    if (fresh.length > 0) onChange([...people, ...fresh])
    setTyped('')
    setSuggestions([])
  }

  /** Turns typed or pasted text into chips; what is not an address stays in the field. */
  const commit = (text: string): void => {
    const parts = text.split(/[,;\n]+/u).map((part) => part.trim()).filter(Boolean)
    const parsed = parts.map(parseContact)
    const good = parsed.filter((contact): contact is Contact => contact !== null)
    const left = parts.filter((_, index) => parsed[index] === null).join(', ')
    add(good)
    setTyped(left)
  }

  const onKey = (event: KeyboardEvent<HTMLInputElement>): void => {
    const open = suggestions.length > 0 && typed.trim() !== ''
    if (open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault()
      setActive((current) => (current + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length)
    } else if (open && event.key === 'Enter') {
      event.preventDefault()
      const pick = suggestions[active]
      if (pick !== undefined) add([pick])
    } else if ((event.key === 'Enter' || event.key === ',' || event.key === ';' || (event.key === 'Tab' && typed.trim() !== '')) && typed.trim() !== '') {
      event.preventDefault()
      commit(typed)
    } else if (event.key === 'Backspace' && typed === '' && people.length > 0) {
      onChange(people.slice(0, -1))
    } else if (event.key === 'Escape' && open) {
      event.stopPropagation()
      setSuggestions([])
    }
  }

  const showing = suggestions.length > 0 && typed.trim() !== ''
  return (
    <div className="recipients" role="group" aria-label={t('recipientsLabel', { field: label })}>
      <label htmlFor={id} className="compose__label">
        {label}
      </label>
      <div className="recipients__box">
        {people.map((person) => (
          <span key={person.address} className="recipient">
            <span>{person.name ?? person.address}</span>
            {person.name !== null && <span className="recipient__address">{person.address}</span>}
            <button type="button" className="recipient__remove" aria-label={t('removeRecipient', { address: person.address })} onClick={() => onChange(people.filter((other) => other.address !== person.address))}>
              <IconClose aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          id={id}
          className="recipients__input"
          value={typed}
          placeholder={people.length === 0 ? t('recipientPlaceholder') : ''}
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={showing}
          aria-controls={showing ? listId : undefined}
          aria-activedescendant={showing ? `${listId}-${active}` : undefined}
          onChange={(event) => setTyped(event.target.value)}
          onKeyDown={onKey}
          onBlur={() => {
            if (typed.trim() !== '') commit(typed)
          }}
          onPaste={(event) => {
            const text = event.clipboardData.getData('text')
            if (/[,;\n]/u.test(text)) {
              event.preventDefault()
              commit(text)
            }
          }}
        />
      </div>
      {showing && (
        <div id={listId} role="listbox" className="recipients__suggestions">
          {suggestions.map((contact, index) => (
            <div
              key={contact.address}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className="recipients__suggestion"
              onPointerDown={(event) => {
                event.preventDefault()
                add([contact])
              }}
              onPointerMove={() => setActive(index)}
            >
              <span>{contact.name ?? contact.address}</span>
              {contact.name !== null && <span className="recipient__address">{contact.address}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
