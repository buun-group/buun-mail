import type { Rule, RuleAction, RuleWhen } from '../api/types'
import i18n from '../i18n'

/** One condition in words: "from *@stripe.com". */
function condition(when: RuleWhen, workspaceName: (id: string) => string): string[] {
  return [
    when.workspace === undefined ? null : i18n.t('rules:describe.in', { workspace: workspaceName(when.workspace) }),
    when.from === undefined ? null : i18n.t('rules:describe.from', { pattern: when.from }),
    when.to === undefined ? null : i18n.t('rules:describe.to', { pattern: when.to }),
    when.subjectContains === undefined ? null : i18n.t('rules:describe.subject', { text: when.subjectContains }),
    when.bodyContains === undefined ? null : i18n.t('rules:describe.body', { text: when.bodyContains }),
    when.tagged === undefined ? null : i18n.t('rules:describe.tagged', { tag: when.tagged }),
  ].filter((part): part is string => part !== null)
}

/** Where a move action sends mail: "Billing, Receipts", or "the inbox" when it names no folder. */
function moveTarget(item: Extract<RuleAction, { type: 'move' }>, workspaceName: (id: string) => string): string {
  const folder = item.folder ?? i18n.t('rules:describe.theInbox')
  const workspace = item.workspace === undefined ? '' : workspaceName(item.workspace)
  if (workspace === '') return i18n.t('rules:describe.moveTo', { folder })
  if (folder === '') return i18n.t('rules:describe.moveTo', { folder: workspace })
  return i18n.t('rules:describe.moveToWorkspace', { workspace, folder })
}

/** One action in words: "tag receipt". */
function action(item: RuleAction, workspaceName: (id: string) => string): string {
  switch (item.type) {
    case 'tag':
      return i18n.t('rules:describe.tag', { tag: item.tag })
    case 'move':
      return moveTarget(item, workspaceName)
    case 'markRead':
      return i18n.t('rules:describe.markRead')
    case 'quiet':
      return i18n.t('rules:describe.quiet')
    case 'trash':
      return i18n.t('rules:describe.trash')
    case 'saveAttachments':
      return i18n.t('rules:describe.saveAttachments', { folder: item.folder })
    case 'alert':
      return i18n.t('rules:describe.alert')
  }
}

/** A rule as one sentence: "Mail from *@stripe.com: tag receipt, mark read." */
export function describeRule(rule: Rule, workspaceName: (id: string) => string): string {
  const separator = i18n.t('rules:describe.separator')
  const when = condition(rule.when, workspaceName)
  return i18n.t('rules:describe.sentence', {
    conditions: when.length === 0 ? i18n.t('rules:describe.noConditions') : when.join(separator),
    actions: rule.actions.map((item) => action(item, workspaceName)).join(separator),
  })
}
