import { useState } from 'react'
import type { ReactNode } from 'react'

import type { Rule, RuleAction, Workspace } from '../../api/types'

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
  const action = <T extends RuleAction['type']>(type: T): Extract<RuleAction, { type: T }> | undefined => rule?.actions.find((item): item is Extract<RuleAction, { type: T }> => item.type === type)
  const [name, setName] = useState(rule?.name ?? '')
  const [workspace, setWorkspace] = useState(rule?.when.workspace ?? '')
  const [from, setFrom] = useState(rule?.when.from ?? '')
  const [to, setTo] = useState(rule?.when.to ?? '')
  const [subject, setSubject] = useState(rule?.when.subjectContains ?? '')
  const [tag, setTag] = useState(action('tag')?.tag ?? '')
  const [moveWorkspace, setMoveWorkspace] = useState(action('move')?.workspace ?? '')
  const [moveFolder, setMoveFolder] = useState(action('move')?.folder ?? '')
  const [move, setMove] = useState(action('move') !== undefined)
  const [markRead, setMarkRead] = useState(action('markRead') !== undefined)
  const [quiet, setQuiet] = useState(action('quiet') !== undefined)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const build = (): Rule => {
    const actions: RuleAction[] = []
    const tagged = blank(tag)
    if (tagged !== undefined) actions.push({ type: 'tag', tag: tagged })
    if (move) actions.push({ type: 'move', ...(blank(moveWorkspace) === undefined ? {} : { workspace: moveWorkspace }), ...(blank(moveFolder) === undefined ? {} : { folder: moveFolder.trim() }) })
    if (markRead) actions.push({ type: 'markRead' })
    if (quiet) actions.push({ type: 'quiet' })
    const when = {
      ...(blank(workspace) === undefined ? {} : { workspace }),
      ...(blank(from) === undefined ? {} : { from: from.trim() }),
      ...(blank(to) === undefined ? {} : { to: to.trim() }),
      ...(blank(subject) === undefined ? {} : { subjectContains: subject.trim() }),
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
      <select id={id} value={value} onChange={(event) => set(event.target.value)}>
        <option value="">{anyLabel}</option>
        {workspaces.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
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
      {field('rule-name', 'Name', name, setName, 'Stripe receipts')}

      <fieldset>
        <legend>When mail</legend>
        <p className="settings__hint">Fill in what matters; leave the rest blank. Addresses can be exact or *@domain.</p>
        {workspacePicker('rule-workspace', 'Is in', workspace, setWorkspace, 'Any workspace')}
        {field('rule-from', 'Is from', from, setFrom, '*@stripe.com')}
        {field('rule-to', 'Was sent to', to, setTo, 'billing@acme.com')}
        {field('rule-subject', 'Has in the subject', subject, setSubject, 'invoice')}
      </fieldset>

      <fieldset>
        <legend>Then</legend>
        {field('rule-tag', 'Tag it', tag, setTag, 'receipt')}
        <label className="rule-editor__check">
          <input type="checkbox" id="rule-move" checked={move} onChange={(event) => setMove(event.target.checked)} />
          Move it
        </label>
        {move && (
          <div className="rule-editor__move">
            {workspacePicker('rule-move-workspace', 'To workspace', moveWorkspace, setMoveWorkspace, 'The same workspace')}
            {field('rule-move-folder', 'Folder', moveFolder, setMoveFolder, 'Inbox when blank')}
          </div>
        )}
        <label className="rule-editor__check">
          <input type="checkbox" id="rule-read" checked={markRead} onChange={(event) => setMarkRead(event.target.checked)} />
          Mark it read
        </label>
        <label className="rule-editor__check">
          <input type="checkbox" id="rule-quiet" checked={quiet} onChange={(event) => setQuiet(event.target.checked)} />
          Keep it quiet (no pop-up or notification)
        </label>
      </fieldset>

      {error !== null && (
        <p role="alert" className="settings__error">
          {error}
        </p>
      )}
      <div className="settings__actions">
        <button type="submit" className="connect__submit" disabled={busy}>
          {rule === null ? 'Add rule' : 'Save rule'}
        </button>
        <button type="button" className="settings__button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
