import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { applyRules, deleteRule, listRules, saveRule } from '../../api/client'
import type { Rule, Workspace } from '../../api/types'
import { IconAdd, IconDelete, IconRun } from '../../icons'
import { describeRule } from '../../lib/rules'
import { RuleEditor } from './RuleEditor'
import { Switch } from './Switch'

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/** Rules: each in one sentence with an on switch, a builder for new ones, and a way to run them over old mail. */
export function RulesSection({ workspaces, onChanged }: { workspaces: Workspace[]; onChanged: () => void }): ReactNode {
  const { t } = useTranslation('rules')
  const [rules, setRules] = useState<Rule[]>([])
  const [editing, setEditing] = useState<Rule | 'new' | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const nameOf = (id: string): string => workspaces.find((workspace) => workspace.id === id)?.name ?? id

  const load = useCallback(() => {
    listRules()
      .then(setRules)
      .catch((cause: unknown) => setError(reason(cause)))
  }, [])
  useEffect(load, [load])

  const save = async (rule: Rule): Promise<void> => {
    await saveRule(rule)
    setEditing(null)
    load()
  }

  return (
    <>
      <p className="settings__intro">{t('intro')}</p>

      {rules.length === 0 ? (
        <p className="settings__empty">{t('empty')}</p>
      ) : (
        <ul className="settings__list">
          {rules.map((rule) => (
            <li key={rule.id} className="rule-row">
              <Switch id={`rule-${rule.id}`} labelledBy={`rule-${rule.id}-name`} checked={rule.enabled} onChange={(enabled) => void saveRule({ ...rule, enabled }).then(load)} />
              <button type="button" className="rule-row__words" onClick={() => setEditing(rule)}>
                <span id={`rule-${rule.id}-name`} className="settings__label">
                  {rule.name}
                </span>
                <span className="settings__hint">{describeRule(rule, nameOf)}</span>
              </button>
              <button type="button" className="settings__icon-button" aria-label={t('delete', { name: rule.name })} onClick={() => void deleteRule(rule.id).then(load)}>
                <IconDelete aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing === null ? (
        <div className="settings__actions">
          <button type="button" className="settings__button" onClick={() => setEditing('new')}>
            <IconAdd aria-hidden="true" />
            {t('new')}
          </button>
          <button
            type="button"
            className="settings__button"
            disabled={rules.length === 0}
            onClick={() => {
              setNote(null)
              applyRules()
                .then((changed) => {
                  setNote(t('changed', { count: changed }))
                  onChanged()
                })
                .catch((cause: unknown) => setError(reason(cause)))
            }}
          >
            <IconRun aria-hidden="true" />
            {t('run')}
          </button>
          {note !== null && <p className="settings__hint">{note}</p>}
        </div>
      ) : (
        <RuleEditor key={editing === 'new' ? 'new' : editing.id} rule={editing === 'new' ? null : editing} workspaces={workspaces} onSave={save} onCancel={() => setEditing(null)} />
      )}
      {error !== null && (
        <p role="alert" className="settings__error">
          {error}
        </p>
      )}
    </>
  )
}
