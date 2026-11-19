import { useState } from 'react'
import type { ReactNode } from 'react'

import { IconClose, IconTag } from '../../icons'

import './Tags.css'

/** How many tags a list row shows before it says how many more there are. */
const ROW_TAG_LIMIT = 2

/** A message's tags as small chips, for a list row: the first few, then a count. */
export function TagChips({ tags }: { tags: string[] }): ReactNode {
  if (tags.length === 0) return null
  const shown = tags.slice(0, ROW_TAG_LIMIT)
  return (
    <span className="tag-chips">
      {shown.map((tag) => (
        <span key={tag} className="tag-chip">
          {tag}
        </span>
      ))}
      {tags.length > shown.length && <span className="tag-chip tag-chip--more">+{tags.length - shown.length}</span>}
    </span>
  )
}

interface TagEditorProps {
  tags: string[]
  onAdd: (tag: string) => void
  onRemove: (tag: string) => void
  /** Tags already in use, offered as you type. */
  suggestions?: string[]
}

/** The reader's tags: each removable, and a field that adds one on Enter. */
export function TagEditor({ tags, onAdd, onRemove, suggestions = [] }: TagEditorProps): ReactNode {
  const [draft, setDraft] = useState('')
  const listId = 'tag-suggestions'
  return (
    <div className="tag-editor">
      <IconTag aria-hidden="true" className="tag-editor__glyph" />
      {tags.map((tag) => (
        <span key={tag} className="tag-chip tag-chip--removable">
          {tag}
          <button type="button" aria-label={`Remove the tag ${tag}`} onClick={() => onRemove(tag)}>
            <IconClose aria-hidden="true" />
          </button>
        </span>
      ))}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const tag = draft.trim()
          if (tag !== '' && !tags.includes(tag)) onAdd(tag)
          setDraft('')
        }}
      >
        <label htmlFor="new-tag" className="visually-hidden">
          Add a tag
        </label>
        <input id="new-tag" className="tag-editor__input" value={draft} placeholder={tags.length === 0 ? 'Add a tag' : 'Add'} list={listId} onChange={(event) => setDraft(event.target.value)} autoComplete="off" />
        <datalist id={listId}>
          {suggestions
            .filter((tag) => !tags.includes(tag))
            .map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
        </datalist>
      </form>
    </div>
  )
}
