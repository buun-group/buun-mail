import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import { routingPath, routingWorkspaces } from '../../api/client'
import type { Workspace, WorkspaceEdit } from '../../api/types'
import { BRAND_ICONS } from '../../constants/products'
import type { BrandIcon } from '../../constants/products'
import { NEW_WORKSPACE, UNSORTED_WORKSPACE } from '../../constants/ui'
import type { Theme } from '../../constants/ui'
import { shrinkImage } from '../../hooks/useWorkspaceLooks'
import type { WorkspaceLook, WorkspaceLooks } from '../../hooks/useWorkspaceLooks'
import { IconAdd, IconImage, IconRename, IconReset, WORKSPACE_GLYPHS } from '../../icons'
import type { WorkspaceGlyph } from '../../icons'
import { WorkspaceIcon } from '../WorkspaceIcon/WorkspaceIcon'
import { ProfileEditor } from './ProfileEditor'
import { WorkspaceEditor } from './WorkspaceEditor'
import { Skeleton } from '../Busy/Skeleton'

interface WorkspacesSectionProps {
  workspaces: Workspace[]
  looks: WorkspaceLooks
  onLook: (id: string, look: WorkspaceLook | null) => void
  editing: string | null
  onEditing: (id: string | null) => void
  /** The workspace whose editor is open, {@link NEW_WORKSPACE} for one being added, or null. */
  changing: string | null
  onChanging: (id: string | null) => void
  /** Asks before deleting a workspace. */
  onDelete: (workspace: { id: string; name: string }) => void
  /** After a workspace is added or changed, so the sidebar reads them again. */
  onChanged: () => void
  theme: Theme
}

const BLANK: WorkspaceEdit = { id: null, name: '', addresses: [], folders: [] }

const GLYPH_KEYS = Object.keys(WORKSPACE_GLYPHS) as WorkspaceGlyph[]
const BRAND_KEYS = Object.keys(BRAND_ICONS) as BrandIcon[]

/**
 * Every workspace as the routing file defines it: add one, change its name, addresses and folders, delete it, and give
 * it an icon or image and a way of writing. A workspace an integration brings (dissolve.email's) has only the last two.
 */
export function WorkspacesSection({ workspaces, looks, onLook, editing, onEditing, changing, onChanging, onDelete, onChanged, theme }: WorkspacesSectionProps): ReactNode {
  const { t } = useTranslation('settings')
  const defined = workspaces.filter((workspace) => workspace.id !== UNSORTED_WORKSPACE)
  const [path, setPath] = useState<string | null>(null)
  const [writingFor, setWritingFor] = useState<string | null>(null)
  const [routing, setRouting] = useState<WorkspaceEdit[] | null>(null)
  useEffect(() => {
    routingPath()
      .then(setPath)
      .catch(() => setPath(null))
  }, [])
  // The file is read each time an editor opens, so an edit made elsewhere (a gateway domain, by hand) is what it starts from.
  useEffect(() => {
    if (changing === null || changing === NEW_WORKSPACE) return
    let current = true
    routingWorkspaces()
      .then((found) => {
        if (current) setRouting(found)
      })
      .catch(() => {
        if (current) setRouting([])
      })
    return () => {
      current = false
    }
  }, [changing])
  const saved = (): void => {
    onChanging(null)
    onChanged()
  }
  const editorFor = (workspace: Workspace): ReactNode => {
    const initial = routing?.find((edit) => edit.id === workspace.id)
    if (initial === undefined) return <Skeleton rows={3} label={t('workspaces.loading')} />
    return <WorkspaceEditor key={workspace.id} initial={initial} onSaved={saved} onCancel={() => onChanging(null)} onDelete={() => onDelete(workspace)} />
  }
  return (
    <>
      <p className="settings__intro">
        <Trans t={t} i18nKey={path === null ? 'workspaces.introDefault' : 'workspaces.introAt'} components={{ file: <code>{path ?? 'workspaces.toml'}</code>, field: <code>icon</code> }} />
      </p>
      <ul className="settings__list">
        {defined.map((workspace) => (
          <li key={workspace.id}>
            <div className="settings__workspace">
              <WorkspaceIcon name={workspace.name} icon={workspace.icon} theme={theme} look={looks[workspace.id]} size="md" />
              <div>
                <p className="settings__label">{workspace.name}</p>
                <p className="settings__mono">{workspace.addresses.join('  ')}</p>
              </div>
              <div className="settings__workspace-actions">
                {workspace.editable && (
                  <button type="button" className="settings__button" aria-expanded={changing === workspace.id} onClick={() => onChanging(changing === workspace.id ? null : workspace.id)}>
                    <IconRename aria-hidden="true" />
                    {t('workspaces.edit')}
                  </button>
                )}
                <button type="button" className="settings__button" aria-expanded={editing === workspace.id} onClick={() => onEditing(editing === workspace.id ? null : workspace.id)}>
                  {t('workspaces.changeIcon')}
                </button>
                <button type="button" className="settings__button" aria-expanded={writingFor === workspace.id} onClick={() => setWritingFor(writingFor === workspace.id ? null : workspace.id)}>
                  {t('profile.edit')}
                </button>
              </div>
            </div>
            {changing === workspace.id && workspace.editable && editorFor(workspace)}
            {writingFor === workspace.id && <ProfileEditor workspace={workspace} />}
            {editing === workspace.id && <IconPicker workspace={workspace} theme={theme} look={looks[workspace.id]} onLook={(look) => onLook(workspace.id, look)} />}
          </li>
        ))}
        <li>
          {changing === NEW_WORKSPACE ? (
            <WorkspaceEditor key={NEW_WORKSPACE} initial={BLANK} onSaved={saved} onCancel={() => onChanging(null)} />
          ) : (
            <div className="settings__workspace--new">
              <button type="button" className="settings__button" onClick={() => onChanging(NEW_WORKSPACE)}>
                <IconAdd aria-hidden="true" />
                {t('workspaces.addWorkspace')}
              </button>
            </div>
          )}
        </li>
      </ul>
    </>
  )
}

function IconPicker({ workspace, theme, look, onLook }: { workspace: Workspace; theme: Theme; look: WorkspaceLook | undefined; onLook: (look: WorkspaceLook | null) => void }): ReactNode {
  const { t } = useTranslation('settings')
  const [error, setError] = useState<string | null>(null)
  const current = look?.kind === 'glyph' ? look.key : look === undefined ? workspace.icon : null
  return (
    <div className="icon-picker">
      <div className="icon-picker__grid" role="radiogroup" aria-label={t('workspaces.iconFor', { name: workspace.name })}>
        {BRAND_KEYS.map((key) => (
          <button key={key} type="button" role="radio" aria-checked={current === key} aria-label={BRAND_ICONS[key].name} className="icon-picker__glyph icon-picker__brand" onClick={() => onLook({ kind: 'glyph', key })}>
            <img src={BRAND_ICONS[key].mark[theme]} alt="" />
          </button>
        ))}
        <span className="icon-picker__break" aria-hidden="true" />
        {GLYPH_KEYS.map((key) => {
          const Glyph = WORKSPACE_GLYPHS[key]
          return (
            <button key={key} type="button" role="radio" aria-checked={current === key} aria-label={t(`workspaces.glyphs.${key}`)} className="icon-picker__glyph" onClick={() => onLook({ kind: 'glyph', key })}>
              <Glyph aria-hidden="true" />
            </button>
          )
        })}
      </div>
      <div className="icon-picker__actions">
        <label className="settings__button">
          <IconImage aria-hidden="true" />
          {t('workspaces.upload')}
          <input
            id={`image-${workspace.id}`}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="visually-hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file === undefined) return
              setError(null)
              shrinkImage(file)
                .then((src) => onLook({ kind: 'image', src }))
                .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : t('workspaces.imageUnreadable')))
            }}
          />
        </label>
        <button type="button" className="settings__button" onClick={() => onLook(null)} disabled={look === undefined}>
          <IconReset aria-hidden="true" />
          {t('workspaces.reset')}
        </button>
        {error !== null && (
          <p role="alert" className="settings__error">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
