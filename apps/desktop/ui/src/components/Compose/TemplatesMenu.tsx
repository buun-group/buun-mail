import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { deleteTemplate, saveTemplate } from '../../api/client'
import type { Template } from '../../api/types'
import { IconAdd, IconClose, IconText } from '../../icons'
import { toast } from '../../lib/feedback'
import { keepWriting, loadWriting, templatesFor } from '../../lib/writing'
import { Popover } from '../Popover/Popover'

/**
 * Saved replies for the compose window: the templates for the message's workspace first, then those for every
 * workspace; picking one inserts its words above the signature (and its subject when there is none yet). The open
 * message can be saved as a new template, for this workspace or every one, and a template removed.
 */
export function TemplatesMenu({ anchor, workspace, subject, text, onInsert, onClose }: { anchor: HTMLElement; workspace: string | null; subject: string; text: string; onInsert: (template: Template) => void; onClose: () => void }): ReactNode {
  const { t } = useTranslation('compose')
  const [templates, setTemplates] = useState<Template[]>(() => templatesFor(workspace))
  const [name, setName] = useState('')
  const [forAll, setForAll] = useState(workspace === null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadWriting().then(() => setTemplates(templatesFor(workspace)))
  }, [workspace])

  const save = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    // The words written so far, without the signature and anything quoted below it.
    const words = text.split(/\n-- \n/u)[0]?.trim() ?? ''
    saveTemplate({ id: '', name, workspace: forAll ? null : workspace, subject, text: words })
      .then((writing) => {
        keepWriting(writing)
        setTemplates(templatesFor(workspace))
        setName('')
        setError(null)
        toast({ text: t('templates.saved'), detail: name, tone: 'done' })
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
  }

  return (
    <Popover anchor={anchor} label={t('templates.label')} onClose={onClose}>
      <div className="templates">
        {templates.length === 0 ? (
          <p className="templates__empty">{t('templates.none')}</p>
        ) : (
          <ul className="templates__list">
            {templates.map((template) => (
              <li key={template.id} className="templates__item">
                <button type="button" className="context-menu__item templates__use" onClick={() => onInsert(template)}>
                  <IconText aria-hidden="true" />
                  <span className="context-menu__words">{template.name}</span>
                  {template.workspace === null && <span className="templates__scope">{t('templates.everywhere')}</span>}
                </button>
                <button
                  type="button"
                  className="templates__remove"
                  aria-label={t('templates.remove', { name: template.name })}
                  onClick={() =>
                    void deleteTemplate(template.id).then((writing) => {
                      keepWriting(writing)
                      setTemplates(templatesFor(workspace))
                    })
                  }
                >
                  <IconClose aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form className="templates__save" onSubmit={save}>
          <label htmlFor="template-name">{t('templates.saveThis')}</label>
          <div className="templates__row">
            <input id="template-name" value={name} placeholder={t('templates.namePlaceholder')} onChange={(event) => setName(event.target.value)} autoComplete="off" />
            <button type="submit" className="templates__add" aria-label={t('templates.add')}>
              <IconAdd aria-hidden="true" />
            </button>
          </div>
          {workspace !== null && (
            <label className="templates__all">
              <input type="checkbox" checked={forAll} onChange={(event) => setForAll(event.target.checked)} />
              {t('templates.forAll')}
            </label>
          )}
          {error !== null && (
            <p role="alert" className="templates__error">
              {error}
            </p>
          )}
        </form>
      </div>
    </Popover>
  )
}
