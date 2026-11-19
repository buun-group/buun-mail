import type { Rule, RuleAction, RuleWhen } from '../api/types'

/** One condition in words: "from *@stripe.com". */
function condition(when: RuleWhen, workspaceName: (id: string) => string): string[] {
  return [
    when.workspace === undefined ? null : `in ${workspaceName(when.workspace)}`,
    when.from === undefined ? null : `from ${when.from}`,
    when.to === undefined ? null : `to ${when.to}`,
    when.subjectContains === undefined ? null : `with "${when.subjectContains}" in the subject`,
  ].filter((part): part is string => part !== null)
}

/** One action in words: "tag receipt". */
function action(item: RuleAction, workspaceName: (id: string) => string): string {
  switch (item.type) {
    case 'tag':
      return `tag ${item.tag}`
    case 'move':
      return `move to ${[item.workspace === undefined ? null : workspaceName(item.workspace), item.folder ?? 'the inbox'].filter(Boolean).join(', ')}`
    case 'markRead':
      return 'mark read'
    case 'quiet':
      return 'keep quiet'
  }
}

/** A rule as one sentence: "Mail from *@stripe.com: tag receipt, mark read." */
export function describeRule(rule: Rule, workspaceName: (id: string) => string): string {
  const when = condition(rule.when, workspaceName)
  return `Mail ${when.length === 0 ? '(no conditions)' : when.join(', ')}: ${rule.actions.map((item) => action(item, workspaceName)).join(', ')}.`
}
