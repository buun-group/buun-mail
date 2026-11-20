import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { listAlerts, pickFolder } from '../../api/client'
import type { AlertChannel, Rule, RuleAction, Workspace } from '../../api/types'
import { Select } from '../Select/Select'

interface RuleEditorProps {
  /** The rule to edit, or null for a new one. */
  rule: Rule | null
  workspaces: Workspace[]
  onSave: (rule: Rule) => Promise<void>
  onCancel: () => void
}

/** A blank field means "does not matter" for a condition, and "not this action" for an action. */
const blank = (value: string): string | undefined => (value.trim() === '' ? undefined : value.trim())

/**
 * The rule builder, in plain words: When (workspace, from, to, subject) and Then (tag, move, mark read, keep quiet).
 * The Rust side checks the rule and its reason shows here when it is refused.
 */
export function RuleEditor({ rule, workspaces, onSave, onCancel }: RuleEditorProps): ReactNode {
  const { t } = useTranslation(['rules', 'common'])
  const action = <T extends RuleAction['type']>(type: T): Extract<RuleAction, { type: T }> | undefined => rule?.actions.find((item): item is Extract<RuleAction, { type: T }> => item.type === type)
  const [name, setName] = useState(rule?.name ?? '')
  const [workspace, setWorkspace] = useState(rule?.when.workspace ?? '')
  const [from, setFrom] = useState(rule?.when.from ?? '')
  const [to, setTo] = useState(rule?.when.to ?? '')
  const [subject, setSubject] = useState(rule?.when.subjectContains ?? '')
  const [body, setBody] = useState(rule?.when.bodyContains ?? '')
  const [tagged, setTagged] = useState(rule?.when.tagged ?? '')
  const [tag, setTag] = useState(action('tag')?.tag ?? '')
  const [moveWorkspace, setMoveWorkspace] = useState(action('move')?.workspace ?? '')
  const [moveFolder, setMoveFolder] = useState(action('move')?.folder ?? '')
  const [move, setMove] = useState(action('move') !== undefined)
  const [markRead, setMarkRead] = useState(action('markRead') !== undefined)
  const [quiet, setQuiet] = useState(action('quiet') !== undefined)
  const [toTrash, setToTrash] = useState(action('trash') !== undefined)
  const [saveFolder, setSaveFolder] = useState(action('saveAttachments')?.folder ?? '')
  const [alert, setAlert] = useState(action('alert')?.channel ?? '')
  const [channels, setChannels] = useState<AlertChannel[]>([])
  useEffect(() => {
    listAlerts()
      .then(setChannels)
      .catch(() => setChannels([]))
  }, [])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const build = (): Rule => {
    const actions: RuleAction[] = []
    const tagToAdd = blank(tag)
    if (tagToAdd !== undefined) actions.push({ type: 'tag', tag: tagToAdd })
    if (move) actions.push({ type: 'move', ...(blank(moveWorkspace) === undefined ? {} : { workspace: moveWorkspace }), ...(blank(moveFolder) === undefined ? {} : { folder: moveFolder.trim() }) })
    if (markRead) actions.push({ type: 'markRead' })
    if (quiet) actions.push({ type: 'quiet' })
    if (toTrash) actions.push({ type: 'trash' })
    if (saveFolder.trim() !== '') actions.push({ type: 'saveAttachments', folder: saveFolder.trim() })
    if (alert !== '') actions.push({ type: 'alert', channel: alert })
    const when = {
      ...(blank(workspace) === undefined ? {} : { workspace }),
      ...(blank(from) === undefined ? {} : { from: from.trim() }),
      ...(blank(to) === undefined ? {} : { to: to.trim() }),
      ...(blank(subject) === undefined ? {} : { subjectContains: subject.trim() }),
      ...(blank(body) === undefined ? {} : { bodyContains: body.trim() }),
      ...(blank(tagged) === undefined ? {} : { tagged: tagged.trim() }),
    }
    return { id: rule?.id ?? '', name: name.trim(), enabled: rule?.enabled ?? true, when, actions }
  }

  const field = (id: string, label: string, value: string, set: (value: string) => void, placeholder: string): ReactNode => (
    <div className="connect__field">
      <label htmlFor={id}>{label}</label>
      <input id={id} value={value} placeholder={placeholder} onChange={(event) => set(event.target.value)} autoComplete="off" spellCheck={false} />
    </div>
  )

  const workspacePicker = (id: string, label: string, value: string, set: (value: string) => void, anyLabel: string): ReactNode => (
    <div className="connect__field">
      <label htmlFor={id}>{label}</label>
      <Select id={id} value={value} onChange={set} options={[{ value: '', label: anyLabel }, ...workspaces.map((item) => ({ value: item.id, label: item.name }))]} />
    </div>
  )

  return (
    <form
      className="rule-editor"
      onSubmit={(event) => {
        event.preventDefault()
        setBusy(true)
        setError(null)
        onSave(build())
          .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
          .finally(() => setBusy(false))
      }}
    >
      {field('rule-name', t('editor.name'), name, setName, t('editor.namePlaceholder'))}

      <fieldset>
        <legend>{t('editor.when')}</legend>
        <p className="settings__hint">{t('editor.whenHint')}</p>
        {workspacePicker('rule-workspace', t('editor.isIn'), workspace, setWorkspace, t('editor.anyWorkspace'))}
        {field('rule-from', t('editor.isFrom'), from, setFrom, '*@stripe.com')}
        {field('rule-to', t('editor.sentTo'), to, setTo, 'billing@acme.com')}
        {field('rule-subject', t('editor.subject'), subject, setSubject, t('editor.subjectPlaceholder'))}
        {field('rule-body', t('editor.body'), body, setBody, t('editor.bodyPlaceholder'))}
        {field('rule-tagged', t('editor.tagged'), tagged, setTagged, t('editor.taggedPlaceholder'))}
      </fieldset>

      <fieldset>
        <legend>{t('editor.then')}</legend>
        {field('rule-tag', t('editor.tag'), tag, setTag, t('editor.tagPlaceholder'))}
        <label className="rule-editor__check">
          <input type="checkbox" id="rule-move" checked={move} onChange={(event) => setMove(event.target.checked)} />
          {t('editor.move')}
        </label>
        {move && (
          <div className="rule-editor__move">
            {workspacePicker('rule-move-workspace', t('editor.toWorkspace'), moveWorkspace, setMoveWorkspace, t('editor.sameWorkspace'))}
            {field('rule-move-folder', t('editor.folder'), moveFolder, setMoveFolder, t('editor.folderPlaceholder'))}
          </div>
        )}
        <label className="rule-editor__check">
          <input type="checkbox" id="rule-read" checked={markRead} onChange={(event) => setMarkRead(event.target.checked)} />
          {t('editor.markRead')}
        </label>
        <label className="rule-editor__check">
          <input type="checkbox" id="rule-quiet" checked={quiet} onChange={(event) => setQuiet(event.target.checked)} />
          {t('editor.quiet')}
        </label>
        <label className="rule-editor__check">
          <input type="checkbox" id="rule-trash" checked={toTrash} onChange={(event) => setToTrash(event.target.checked)} />
          {t('editor.trash')}
        </label>
        <div className="connect__field">
          <label htmlFor="rule-save">{t('editor.saveAttachments')}</label>
          <div className="rule-editor__folder">
            <input id="rule-save" value={saveFolder} placeholder={t('editor.saveAttachmentsPlaceholder')} onChange={(event) => setSaveFolder(event.target.value)} autoComplete="off" spellCheck={false} />
            <button type="button" className="settings__button" onClick={() => void pickFolder().then((picked) => picked !== null && setSaveFolder(picked))}>
              {t('editor.chooseFolder')}
            </button>
          </div>
          <small>{t('editor.saveAttachmentsHint')}</small>
        </div>
        <div className="connect__field">
          <label htmlFor="rule-alert">{t('editor.alert')}</label>
          <Select id="rule-alert" value={alert} onChange={setAlert} options={[{ value: '', label: t('editor.noAlert') }, ...channels.map((channel) => ({ value: channel.id, label: channel.name }))]} />
          <small>{t('editor.alertHint')}</small>
        </div>
      </fieldset>

      {error !== null && (
        <p role="alert" className="settings__error">
          {error}
        </p>
      )}
      <div className="settings__actions">
        <button type="submit" className="connect__submit" disabled={busy}>
          {rule === null ? t('editor.add') : t('editor.save')}
        </button>
        <button type="button" className="settings__button" onClick={onCancel}>
          {t('common:cancel')}
        </button>
      </div>
    </form>
  )
}
