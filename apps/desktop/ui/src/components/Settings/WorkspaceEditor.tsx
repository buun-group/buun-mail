import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { saveWorkspace } from '../../api/client'
import type { WorkspaceEdit } from '../../api/types'
import { IconAdd, IconCheck, IconClose, IconDelete } from '../../icons'
import { toast } from '../../lib/feedback'
import { BusyButton } from '../Busy/BusyButton'
import { TipButton } from '../Tooltip/TipButton'

interface WorkspaceEditorProps {
  /** The workspace as the routing file has it; a new one has no id. */
  initial: WorkspaceEdit
  /** After a save, with the workspace's id. */
  onSaved: (id: string) => void
  onCancel: () => void
  /** Asks before deleting; left out for a new workspace. */
  onDelete?: () => void
}

/** A folder row while editing; the key keeps each row's fields steady as rows come and go. */
interface FolderRow {
  key: number
  name: string
  from: string
  icon: string | null
}

/**
 * Adds or changes a workspace in the routing file: its name, the addresses it owns (one a line) and its folders, each
 * picked by sender. The desktop app checks the whole file before saving, so a problem (two workspaces claiming one
 * address, an address it cannot read) shows here and the file stays as it was.
 */
export function WorkspaceEditor({ initial, onSaved, onCancel, onDelete }: WorkspaceEditorProps): ReactNode {
  const { t } = useTranslation('settings')
  const prefix = `workspace-${initial.id ?? 'new'}`
  const [name, setName] = useState(initial.name)
  const [addresses, setAddresses] = useState(initial.addresses.join('\n'))
  const [folders, setFolders] = useState<FolderRow[]>(() => initial.folders.map((folder, key) => ({ key, ...folder })))
  const [nextKey, setNextKey] = useState(initial.folders.length)
  const [error, setError] = useState<string | null>(null)
  const nameField = useRef<HTMLInputElement | null>(null)
  // Opened from the sidebar, the editor may be far down the list: it comes into view with its name ready to type.
  useEffect(() => {
    nameField.current?.focus({ preventScroll: true })
    nameField.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, [])

  const change = (key: number, field: 'name' | 'from', text: string): void => setFolders((rows) => rows.map((row) => (row.key === key ? { ...row, [field]: text } : row)))
  const addFolder = (): void => {
    setFolders((rows) => [...rows, { key: nextKey, name: '', from: '', icon: null }])
    setNextKey((key) => key + 1)
  }
  const save = async (): Promise<void> => {
    setError(null)
    const edit: WorkspaceEdit = {
      id: initial.id,
      name,
      addresses: addresses.split(/[\n,]/),
      folders: folders.map(({ name: folder, from, icon }) => ({ name: folder, from, icon })),
    }
    try {
      const id = await saveWorkspace(edit)
      toast({ text: initial.id === null ? t('workspaces.added') : t('workspaces.saved'), detail: name.trim(), tone: 'done' })
      onSaved(id)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      throw reason
    }
  }

  return (
    <form
      className="workspace-editor"
      aria-label={initial.id === null ? t('workspaces.newTitle') : t('workspaces.editTitle', { name: initial.name })}
      onSubmit={(event) => {
        event.preventDefault()
        void save().catch(() => undefined)
      }}
    >
      <div className="connect__field">
        <label htmlFor={`${prefix}-name`}>{t('workspaces.name')}</label>
        <input ref={nameField} id={`${prefix}-name`} value={name} placeholder={t('workspaces.namePlaceholder')} autoComplete="off" onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="connect__field">
        <label htmlFor={`${prefix}-addresses`}>{t('workspaces.addresses')}</label>
        <textarea id={`${prefix}-addresses`} rows={3} value={addresses} placeholder={t('workspaces.addressesPlaceholder')} spellCheck={false} onChange={(event) => setAddresses(event.target.value)} />
        <small>{t('workspaces.addressesHint')}</small>
      </div>
      <fieldset className="workspace-editor__folders">
        <legend>{t('workspaces.folders')}</legend>
        <small>{t('workspaces.foldersHint')}</small>
        {folders.map((folder, index) => (
          <div key={folder.key} className="workspace-editor__folder">
            <input aria-label={t('workspaces.folderName', { number: index + 1 })} value={folder.name} placeholder={t('workspaces.folderNamePlaceholder')} autoComplete="off" onChange={(event) => change(folder.key, 'name', event.target.value)} />
            <input aria-label={t('workspaces.folderFrom', { number: index + 1 })} value={folder.from} placeholder={t('workspaces.folderFromPlaceholder')} autoComplete="off" spellCheck={false} onChange={(event) => change(folder.key, 'from', event.target.value)} />
            <TipButton type="button" tip={t('workspaces.removeFolder')} className="settings__icon-button" aria-label={t('workspaces.removeFolderLabel', { number: index + 1 })} onClick={() => setFolders((rows) => rows.filter((row) => row.key !== folder.key))}>
              <IconClose aria-hidden="true" />
            </TipButton>
          </div>
        ))}
        <div>
          <button type="button" className="settings__button" onClick={addFolder}>
            <IconAdd aria-hidden="true" />
            {t('workspaces.addFolder')}
          </button>
        </div>
      </fieldset>
      {error !== null && (
        <p role="alert" className="settings__error">
          {error}
        </p>
      )}
      <div className="settings__actions">
        <BusyButton className="settings__button" glyph={IconCheck} run={save} busyLabel={t('workspaces.saving')}>
          {initial.id === null ? t('workspaces.add') : t('workspaces.save')}
        </BusyButton>
        <button type="button" className="settings__button" onClick={onCancel}>
          {t('workspaces.cancel')}
        </button>
        {onDelete !== undefined && (
          <button type="button" className="settings__button settings__button--danger workspace-editor__delete" onClick={onDelete}>
            <IconDelete aria-hidden="true" />
            {t('workspaces.delete')}
          </button>
        )}
      </div>
    </form>
  )
}
