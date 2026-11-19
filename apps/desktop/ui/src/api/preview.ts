import type { Activity, AgentStatus, MailView, Message, MessageDetail, Place, Rule, TagCount, Workspace } from './types'

/**
 * A small stand-in mailbox for `pnpm dev:ui`, where there is no Rust side, so the layout can be tuned in a plain
 * browser. The desktop app never reads it: there the router places the real demo messages.
 */
const WORKSPACES: Workspace[] = [
  { id: 'buun', name: 'Buun Group', icon: 'buun', addresses: ['*@buungroup.com'], unread: 2, folders: [{ name: null, icon: null, unread: 1 }, { name: 'Billing', icon: 'receipt', unread: 1 }] },
  { id: 'plotwork', name: 'Plotwork', icon: 'plotwork', addresses: ['*@plotwork.dev'], unread: 1, folders: [{ name: null, icon: null, unread: 1 }, { name: 'GitHub', icon: 'github', unread: 0 }] },
  { id: 'personal', name: 'Personal', icon: null, addresses: ['*@personal.example'], unread: 0, folders: [{ name: null, icon: null, unread: 0 }] },
]

const MESSAGES: Message[] = [
  {
    id: 'p1', workspace: 'buun', folder: 'Billing', fromName: 'Stripe', from: 'invoices@stripe.com', to: 'billing@buungroup.com',
    matched: '*@buungroup.com', folderMatched: '*@stripe.com', subject: 'Your invoice for November is ready',
    preview: 'Invoice INV-2026-11 is now available. Amount due on 1 December.', receivedAt: '2026-11-19T07:42:00Z', unread: true, starred: false, shelf: 'active', tags: ['invoice'],
  },
  {
    id: 'p2', workspace: 'buun', folder: null, fromName: 'A client', from: 'projects@client.example', to: 'hello@buungroup.com',
    matched: '*@buungroup.com', folderMatched: null, subject: 'Quote for the booking site',
    preview: 'Could you send the quote through by Friday so we can sign off?', receivedAt: '2026-11-18T23:05:00Z', unread: true, starred: true, shelf: 'active', tags: [],
  },
  {
    id: 'p3', workspace: 'plotwork', folder: null, fromName: 'A Plotwork team', from: 'lead@team.example', to: 'support@plotwork.dev',
    matched: '*@plotwork.dev', folderMatched: null, subject: 'Sequence diagrams in the board',
    preview: 'Is there a way to pin a sequence diagram to a tab?', receivedAt: '2026-11-18T21:14:00Z', unread: true, starred: false, shelf: 'active', tags: [],
  },
  {
    id: 'p4', workspace: 'personal', folder: null, fromName: 'A friend', from: 'friend@mail.example', to: 'me@personal.example',
    matched: '*@personal.example', folderMatched: null, subject: 'Saturday',
    preview: 'Still on for Saturday? We could do the coastal walk.', receivedAt: '2026-11-18T19:55:00Z', unread: false, starred: false, shelf: 'archived', tags: [],
  },
]

export function previewWorkspaces(): Workspace[] {
  return WORKSPACES
}

export function previewMessages(place: Place): Message[] {
  return MESSAGES.filter((message) => message.workspace === place.workspace && message.folder === place.folder && message.shelf === 'active').map((message) => ({ ...message }))
}

export function previewView(view: MailView): Message[] {
  const keep = { starred: (message: Message) => message.starred && message.shelf !== 'trashed', archive: (message: Message) => message.shelf === 'archived', trash: (message: Message) => message.shelf === 'trashed' }[view]
  return MESSAGES.filter(keep).map((message) => ({ ...message }))
}

export function previewDetail(id: string): MessageDetail {
  const message = MESSAGES.find((item) => item.id === id) ?? MESSAGES[0]
  if (message === undefined) throw new Error('The preview mailbox is empty.')
  message.unread = false
  const cc = message.id === 'p2' ? [{ name: 'Their studio', address: 'studio@client.example' }] : []
  return { message: { ...message }, body: message.preview, recipients: { to: [{ name: null, address: message.to }], cc, replyTo: [] } }
}

/** The rules, tags and agent status the preview keeps in memory, so those screens can be worked on in a browser. */
const RULES: Rule[] = [
  { id: 'preview-1', name: 'Stripe receipts', enabled: true, when: { from: '*@stripe.com' }, actions: [{ type: 'tag', tag: 'receipt' }, { type: 'markRead' }] },
]
const AGENT: AgentStatus = { enabled: false, running: false, url: 'http://127.0.0.1:28700/mcp', token: 'preview-token-only-in-the-browser', problem: null }

function retag(id: string, change: (tags: string[]) => string[]): Message {
  const message = MESSAGES.find((item) => item.id === id)
  if (message === undefined) throw new Error('No message has that id.')
  message.tags = change(message.tags)
  return { ...message }
}

function found(id: string): Message {
  const message = MESSAGES.find((item) => item.id === id)
  if (message === undefined) throw new Error('No message has that id.')
  return message
}

export const preview = {
  change: (ids: string[], fields: Partial<Pick<Message, 'unread' | 'starred' | 'shelf'>>): Message[] => ids.map((id) => ({ ...Object.assign(found(id), fields) })),
  move: (id: string, place: Place): Message => ({ ...Object.assign(found(id), { workspace: place.workspace, folder: place.folder }) }),
  remove: (ids: string[]): number => {
    const before = MESSAGES.length
    ids.forEach((id) => {
      const at = MESSAGES.findIndex((item) => item.id === id)
      if (at !== -1) MESSAGES.splice(at, 1)
    })
    return before - MESSAGES.length
  },
  tag: (id: string, tags: string[]): Message => retag(id, (current) => [...new Set([...current, ...tags])].sort()),
  untag: (id: string, tag: string): Message => retag(id, (current) => current.filter((item) => item !== tag)),
  tags: (): TagCount[] => {
    const counts = new Map<string, number>()
    MESSAGES.flatMap((message) => message.tags).forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1))
    return [...counts].map(([tag, count]) => ({ tag, count }))
  },
  rules: (): Rule[] => RULES.map((rule) => ({ ...rule })),
  saveRule: (rule: Rule): Rule => {
    const saved = { ...rule, id: rule.id || `preview-${RULES.length + 1}` }
    const at = RULES.findIndex((item) => item.id === saved.id)
    if (at === -1) RULES.push(saved)
    else RULES[at] = saved
    return saved
  },
  deleteRule: (id: string): boolean => {
    const at = RULES.findIndex((item) => item.id === id)
    if (at !== -1) RULES.splice(at, 1)
    return at !== -1
  },
  activity: (): Activity[] => [{ at: '2026-11-19T07:43:00Z', actor: 'rule:Stripe receipts', action: 'apply', detail: '"Your invoice for November is ready"' }],
  agent: (): AgentStatus => ({ ...AGENT }),
  setAgent: (enabled: boolean): AgentStatus => {
    AGENT.enabled = enabled
    return { ...AGENT }
  },
}
