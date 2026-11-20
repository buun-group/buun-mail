import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { messageNote, setMessageNote } from '../../api/client'
import { IconRename } from '../../icons'
import { toast } from '../../lib/feedback'

/**
 * A private note on the conversation ("Refunded in Stripe on the 20th"), kept only on this computer and never sent:
 * Add a note opens a box that saves when it loses focus or on Ctrl or Cmd and Enter. Keyed by message by its caller.
 */
export function ConversationNote({ messageId }: { messageId: string }): ReactNode {
  const { t } = useTranslation('mail')
  const [note, setNote] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const box = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    void messageNote(messageId).then((found) => {
      setNote(found)
      setText(found ?? '')
    })
  }, [messageId])

  useEffect(() => {
    if (editing) box.current?.focus()
  }, [editing])

  const save = (): void => {
    setEditing(false)
    if (text.trim() === (note ?? '').trim()) return
    void setMessageNote(messageId, text).then(() => {
      setNote(text.trim() === '' ? null : text)
      toast({ text: text.trim() === '' ? t('note.removed') : t('note.saved'), tone: 'done', glyph: IconRename })
    })
  }

  if (editing) {
    return (
      <div className="note">
        <label htmlFor={`note-${messageId}`} className="note__label">
          {t('note.label')}
        </label>
        <textarea
          ref={box}
          id={`note-${messageId}`}
          className="note__box"
          rows={3}
          value={text}
          placeholder={t('note.placeholder')}
          onChange={(event) => setText(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) save()
            if (event.key === 'Escape') {
              setText(note ?? '')
              setEditing(false)
            }
          }}
        />
        <small className="note__hint">{t('note.hint')}</small>
      </div>
    )
  }
  if (note === null) {
    return (
      <button type="button" className="note__add" onClick={() => setEditing(true)}>
        <IconRename aria-hidden="true" />
        {t('note.add')}
      </button>
    )
  }
  return (
    <button type="button" className="note note--shown" onClick={() => setEditing(true)} aria-label={t('note.edit')}>
      <span className="note__label">
        <IconRename aria-hidden="true" />
        {t('note.label')}
      </span>
      <span className="note__text">{note}</span>
    </button>
  )
}
