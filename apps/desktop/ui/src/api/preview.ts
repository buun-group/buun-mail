import type { Activity, AgentStatus, AlertChannel, AlertKind, Contact, RevealStatus, DissolveInbox, DissolveStatus, Draft, ImapAccount, KnownContact, SmtpServer, MailView, Message, MessageDetail, Place, Rule, Sendable, Sender, TagCount, Workspace } from './types'

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
    id: 'p5', workspace: 'buun', folder: 'Sent', fromName: 'Buun Group', from: 'hello@buungroup.com', to: 'projects@client.example',
    matched: null, folderMatched: null, subject: 'Re: Quote for the booking site',
    preview: 'Thanks, the quote is on its way today.', receivedAt: '2026-11-18T22:40:00Z', unread: false, starred: false, shelf: 'active', tags: [], threadId: 'quote@client.example', threadSize: 2, snoozedUntil: null, size: null, checks: null,
  },
  {
    id: 'p1', workspace: 'buun', folder: 'Billing', fromName: 'Stripe', from: 'invoices@stripe.com', to: 'billing@buungroup.com',
    matched: '*@buungroup.com', folderMatched: '*@stripe.com', subject: 'Your invoice for November is ready',
    preview: 'Invoice INV-2026-11 is now available. Amount due on 1 December.', receivedAt: '2026-11-19T07:42:00Z', unread: true, starred: false, shelf: 'active', tags: ['invoice'], threadId: null, threadSize: 1, snoozedUntil: null, size: 64_380,
    checks: { verdict: 'verified', by: 'mx.cloudflare.net', spf: 'pass', dkim: 'pass', dmarc: 'pass' },
  },
  {
    id: 'p2', workspace: 'buun', folder: null, fromName: 'A client', from: 'projects@client.example', to: 'hello@buungroup.com',
    matched: '*@buungroup.com', folderMatched: null, subject: 'Quote for the booking site',
    preview: 'Could you send the quote through by Friday so we can sign off?', receivedAt: '2026-11-18T23:05:00Z', unread: true, starred: true, shelf: 'active', tags: [], threadId: 'quote@client.example', threadSize: 2, snoozedUntil: null, size: null, checks: null,
  },
  {
    id: 'p3', workspace: 'plotwork', folder: null, fromName: 'A Plotwork team', from: 'lead@team.example', to: 'support@plotwork.dev',
    matched: '*@plotwork.dev', folderMatched: null, subject: 'Sequence diagrams in the board',
    preview: 'Is there a way to pin a sequence diagram to a tab?', receivedAt: '2026-11-18T21:14:00Z', unread: true, starred: false, shelf: 'active', tags: [], threadId: null, threadSize: 1, snoozedUntil: null, size: 3_902,
    checks: { verdict: 'failed', by: 'mx.cloudflare.net', spf: 'fail', dkim: 'fail', dmarc: null },
  },
  {
    id: 'p4', workspace: 'personal', folder: null, fromName: 'A friend', from: 'friend@mail.example', to: 'me@personal.example',
    matched: '*@personal.example', folderMatched: null, subject: 'Saturday',
    preview: 'Still on for Saturday? We could do the coastal walk.', receivedAt: '2026-11-18T19:55:00Z', unread: false, starred: false, shelf: 'archived', tags: [], threadId: null, threadSize: 1, snoozedUntil: null, size: null, checks: null,
  },
  {
    id: 'p6', workspace: 'dissolve', folder: 'signup-7k2@dissolve.email', fromName: 'A shop', from: 'no-reply@shop.example', to: 'signup-7k2@dissolve.email',
    matched: null, folderMatched: null, subject: 'Confirm your email',
    preview: 'Your verification code is 482913. It expires in 10 minutes.', receivedAt: '2026-11-19T08:10:00Z', unread: true, starred: false, shelf: 'active', tags: [], threadId: null, threadSize: 1, snoozedUntil: null, size: 6_214,
    checks: { verdict: 'verified', by: 'mx.dissolve.email', spf: 'pass', dkim: 'pass', dmarc: 'pass' },
  },
]

export function previewWorkspaces(): Workspace[] {
  if (!DISSOLVE.connected && DISSOLVE.inboxes.length === 0) return WORKSPACES
  const folders = DISSOLVE.inboxes.map((inbox) => ({ name: inbox.address, icon: null, unread: MESSAGES.filter((message) => message.folder === inbox.address && message.unread).length }))
  const dissolveWorkspace: Workspace = { id: 'dissolve', name: 'dissolve.email', icon: 'dissolve', addresses: DISSOLVE.inboxes.map((inbox) => inbox.address), unread: folders.reduce((sum, folder) => sum + folder.unread, 0), folders: [{ name: null, icon: null, unread: 0 }, ...folders] }
  return [...WORKSPACES, dissolveWorkspace]
}

export function previewMessages(place: Place): Message[] {
  return MESSAGES.filter((message) => message.workspace === place.workspace && message.folder === place.folder && message.shelf === 'active' && message.snoozedUntil === null).map((message) => ({ ...message }))
}

export function previewView(view: MailView): Message[] {
  const keep = { starred: (message: Message) => message.starred && message.shelf !== 'trashed', archive: (message: Message) => message.shelf === 'archived', trash: (message: Message) => message.shelf === 'trashed', snoozed: (message: Message) => message.snoozedUntil !== null, drafts: () => false, contacts: () => false }[view]
  return MESSAGES.filter(keep).map((message) => ({ ...message }))
}

export function previewDetail(id: string): MessageDetail {
  const message = MESSAGES.find((item) => item.id === id) ?? MESSAGES[0]
  if (message === undefined) throw new Error('The preview mailbox is empty.')
  message.unread = false
  const cc = message.id === 'p2' ? [{ name: 'Their studio', address: 'studio@client.example' }] : []
  const html =
    message.id === 'p1'
      ? { html: '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a"><img src="https://stripe.example/logo.png" width="96" alt="Stripe"><h1 style="font-size:22px">Your invoice is ready</h1><p>Invoice <strong>INV-2026-11</strong> for <strong>$120.00</strong> is due on 1 December.</p><p><a href="https://dashboard.stripe.com/invoices" style="background:#635bff;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">View invoice</a></p></div>', remote: 1 }
      : null
  const plainHtml = message.id === 'p6' ? { html: '<div>Your verification code is <b>482913</b>. It expires in 10 minutes.</div><p>If you did not ask for this, ignore this email.</p>', remote: 0 } : null
  const attachments = message.id === 'p1' ? [{ index: 0, name: 'INV-2026-11.pdf', mime: 'application/pdf', size: 48_213, inline: false }] : []
  const authentication = message.id === 'p1' ? { verdict: 'verified' as const, by: 'mx.cloudflare.net', spf: 'pass' as const, dkim: 'pass' as const, dmarc: 'pass' as const } : message.id === 'p3' ? { verdict: 'failed' as const, by: 'mx.cloudflare.net', spf: 'fail' as const, dkim: 'fail' as const, dmarc: null } : null
  return { message: { ...message }, body: message.preview, recipients: { to: [{ name: null, address: message.to }], cc, replyTo: [] }, html: html ?? plainHtml, attachments, authentication }
}

/** The rules, tags and agent status the preview keeps in memory, so those screens can be worked on in a browser. */
const RULES: Rule[] = [
  { id: 'preview-1', name: 'Stripe receipts', enabled: true, when: { from: '*@stripe.com' }, actions: [{ type: 'tag', tag: 'receipt' }, { type: 'markRead' }] },
]
const AGENT: AgentStatus = { enabled: false, running: false, url: 'http://127.0.0.1:28700/mcp', tokenHint: 'wser', problem: null }

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

/** The senders the preview keeps in memory: one, so compose and reply can be worked on in a browser. */
const SENDERS: Sender[] = [{ id: 'preview-sender', name: 'Resend', kind: 'resend', keyHint: 'demo', restricted: false, domains: [{ name: 'buungroup.com', status: 'verified' }, { name: 'plotwork.dev', status: 'pending' }], signature: 'Sacha\nBuun Group', smtp: null }]

const IMAP: ImapAccount[] = []

const HOUR = 3_600_000
const NO_METER = { used: null, limit: null, resetAt: null }
const NO_LIMITS = { plan: null, inboxes: NO_METER, inboxMinutes: null, lifetimeMinutes: null, extensionsPerInbox: null, customNames: null, hourlyCreations: NO_METER, requests: NO_METER, messageChecks: { used: 4, limit: 5, resetAt: null } }
const FREE_LIMITS = { plan: 'free', inboxes: { used: 1, limit: 3, resetAt: null }, inboxMinutes: 10, lifetimeMinutes: 20, extensionsPerInbox: 1, customNames: false, hourlyCreations: { used: 2, limit: 5, resetAt: new Date(Date.now() + 38 * 60_000).toISOString() }, requests: { used: 6, limit: 30, resetAt: null }, messageChecks: { used: 4, limit: 5, resetAt: null } }
const DISSOLVE: DissolveStatus = { connected: false, server: 'https://api.dissolve.email', email: null, plan: null, keepAfterExpiry: false, inboxes: [], lastChecked: null, problem: null, limits: NO_LIMITS }
const dissolveCopy = (): DissolveStatus => ({ ...DISSOLVE, limits: { ...DISSOLVE.limits }, inboxes: DISSOLVE.inboxes.map((inbox) => ({ ...inbox })) })

/** dissolve.email in the browser preview: a pretend account with one inbox, changed in memory. */
const dissolve = {
  status: dissolveCopy,
  connect: (): DissolveStatus => {
    Object.assign(DISSOLVE, { connected: true, email: 'you@example.com', plan: 'free', lastChecked: new Date().toISOString(), limits: FREE_LIMITS })
    if (DISSOLVE.inboxes.length === 0) DISSOLVE.inboxes.push({ id: 'inb_preview', address: 'signup-7k2@dissolve.email', name: 'Sign-ups', expiresAt: new Date(Date.now() + 5 * HOUR).toISOString(), ended: false, stored: 1, extensions: { used: 1, limit: 1, canExtend: false, availableAt: null } })
    return dissolveCopy()
  },
  disconnect: (deleteMail: boolean): DissolveStatus => {
    Object.assign(DISSOLVE, { connected: false, email: null, plan: null, limits: NO_LIMITS })
    if (deleteMail) DISSOLVE.inboxes = []
    return dissolveCopy()
  },
  keep: (keep: boolean): DissolveStatus => {
    DISSOLVE.keepAfterExpiry = keep
    return dissolveCopy()
  },
  create: (name?: string, domain?: string): DissolveInbox => {
    const inbox: DissolveInbox = { id: `inb_${DISSOLVE.inboxes.length + 1}`, address: `${name ?? `new-${DISSOLVE.inboxes.length + 1}`}@${domain ?? 'dissolve.email'}`, name: name ?? null, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), ended: false, stored: 0, extensions: null }
    DISSOLVE.inboxes.unshift(inbox)
    return { ...inbox }
  },
  extend: (id: string): DissolveStatus => {
    const inbox = DISSOLVE.inboxes.find((item) => item.id === id)
    if (inbox !== undefined) inbox.expiresAt = new Date(Date.parse(inbox.expiresAt) + 24 * HOUR).toISOString()
    return dissolveCopy()
  },
  burn: (id: string): DissolveStatus => {
    DISSOLVE.inboxes = DISSOLVE.inboxes.filter((item) => item.id !== id)
    return dissolveCopy()
  },
}

/** The reveal code and alert channels the preview keeps in memory. Its pretend code is checked as plain text. */
const SECURITY: { code: string | null; openUntil: number } = { code: null, openUntil: 0 }
const securityStatus = (): RevealStatus => ({ codeSet: SECURITY.code !== null, openFor: SECURITY.code !== null && SECURITY.openUntil > Date.now() ? Math.round((SECURITY.openUntil - Date.now()) / 1000) : 0 })
const ALERTS: AlertChannel[] = []
const SECRETS = new Map<string, string>([['sender:preview-sender', 're_demo_key_1234'], ['agent:token', 'preview-token-only-in-the-browser']])
const security = {
  status: securityStatus,
  set: (current: string | null, code: string | null): RevealStatus => {
    if (SECURITY.code !== null && current !== SECURITY.code && SECURITY.openUntil <= Date.now()) throw new Error('That code is not right.')
    if (code !== null && code.trim().length < 4) throw new Error('Use at least 4 characters.')
    SECURITY.code = code
    SECURITY.openUntil = 0
    return securityStatus()
  },
  lock: (): RevealStatus => {
    SECURITY.openUntil = 0
    return securityStatus()
  },
  reveal: (kind: string, id: string, code: string | null): string => {
    if (SECURITY.code !== null && SECURITY.openUntil <= Date.now()) {
      if (code === null || code === '') throw new Error('Enter your reveal code.')
      if (code !== SECURITY.code) throw new Error('That code is not right.')
      SECURITY.openUntil = Date.now() + 5 * 60_000
    }
    const secret = SECRETS.get(`${kind}:${id}`)
    if (secret === undefined) throw new Error('That secret is not saved here.')
    return secret
  },
}
const alerts = {
  list: (): AlertChannel[] => ALERTS.map((channel) => ({ ...channel, fields: { ...channel.fields } })),
  add: (channel: { name: string; kind: AlertKind; fields: Record<string, string>; secret: string }): AlertChannel[] => {
    if (channel.kind !== 'email' && channel.secret.trim() === '') throw new Error('Fill in the secret.')
    const id = `alert-${ALERTS.length + 1}`
    ALERTS.push({ id, name: channel.name || `Alert ${ALERTS.length + 1}`, kind: channel.kind, fields: channel.fields, hasSecret: channel.secret !== '', lastSent: null, sent: 0, problem: null })
    if (channel.secret !== '') SECRETS.set(`alert:${id}`, channel.secret)
    return alerts.list()
  },
  remove: (id: string): AlertChannel[] => {
    const at = ALERTS.findIndex((channel) => channel.id === id)
    if (at !== -1) ALERTS.splice(at, 1)
    return alerts.list()
  },
}

export const preview = {
  dissolve,
  security,
  alerts,
  imapAccounts: (): ImapAccount[] => IMAP.map((account) => ({ ...account })),
  addImap: (account: { name: string; host: string; port: number; username: string; folder: string }): ImapAccount[] => {
    if (account.host.trim() === '') throw new Error('the mail server could not be reached: no server name')
    IMAP.push({ id: `imap-${IMAP.length + 1}`, name: account.name || account.username, host: account.host, port: account.port, username: account.username, folder: account.folder || 'INBOX', lastChecked: new Date().toISOString(), received: 0, problem: null })
    return preview.imapAccounts()
  },
  removeImap: (id: string): ImapAccount[] => {
    const at = IMAP.findIndex((account) => account.id === id)
    if (at !== -1) IMAP.splice(at, 1)
    return preview.imapAccounts()
  },
  senders: (): Sender[] => SENDERS.map((sender) => ({ ...sender })),
  addSender: (name: string, key: string, domains: string[]): Sender[] => {
    if (!key.startsWith('re_')) throw new Error('Resend refused the API key: API key is invalid')
    SENDERS.push({ id: `preview-${SENDERS.length + 1}`, name: name || 'Resend', kind: 'resend', keyHint: key.slice(-4), restricted: domains.length > 0, domains: domains.map((domain) => ({ name: domain, status: 'entered' })), signature: '', smtp: null })
    return preview.senders()
  },
  addSmtp: (name: string, server: SmtpServer, domains: string[]): Sender[] => {
    if (server.host.trim() === '') throw new Error("Enter the mail server's name, such as smtp.gmail.com.")
    SENDERS.push({ id: `preview-${SENDERS.length + 1}`, name: name || server.host, kind: 'smtp', keyHint: '', restricted: true, domains: domains.map((domain) => ({ name: domain, status: 'entered' })), signature: '', smtp: server })
    return preview.senders()
  },
  updateSender: (id: string, change: { signature?: string; domains?: string[] }): Sender[] => {
    const sender = SENDERS.find((item) => item.id === id)
    if (sender !== undefined && change.signature !== undefined) sender.signature = change.signature
    return preview.senders()
  },
  removeSender: (id: string): Sender[] => {
    const at = SENDERS.findIndex((item) => item.id === id)
    if (at !== -1) SENDERS.splice(at, 1)
    return preview.senders()
  },
  sendable: (): Sendable[] => SENDERS.flatMap((sender) => sender.domains.filter((domain) => domain.status === 'verified' || domain.status === 'entered').map((domain) => ({ domain: domain.name, signature: sender.signature }))),
  send: (draft: Draft): Message => {
    const sent: Message = {
      id: `sent-${Date.now()}`, workspace: 'buun', folder: 'Sent', fromName: draft.from.name ?? draft.from.address, from: draft.from.address, to: draft.to[0]?.address ?? '',
      matched: null, folderMatched: null, subject: draft.subject, preview: draft.text.slice(0, 120), receivedAt: new Date().toISOString(), unread: false, starred: false, shelf: 'active', tags: [], threadId: null, threadSize: 1, snoozedUntil: null, size: null, checks: null,
    }
    MESSAGES.push(sent)
    return { ...sent }
  },
  thread: (threadId: string): Message[] => MESSAGES.filter((message) => message.threadId === threadId).map((message) => ({ ...message })),
  searchAll: (query: string): Message[] => {
    const words = query.toLowerCase().split(/\s+/u).filter(Boolean)
    return MESSAGES.filter((message) => message.shelf !== 'trashed' && words.every((word) => `${message.subject} ${message.fromName} ${message.from} ${message.preview}`.toLowerCase().includes(word))).map((message) => ({ ...message }))
  },
  knownContacts: (query: string): KnownContact[] => {
    const seen = new Map<string, KnownContact>()
    MESSAGES.forEach((message) => {
      const address = message.folder === 'Sent' ? message.to : message.from
      const known = seen.get(address)
      seen.set(address, { name: message.folder === 'Sent' ? (known?.name ?? null) : message.fromName, address, messages: (known?.messages ?? 0) + 1, latest: known === undefined || message.receivedAt > known.latest ? message.receivedAt : known.latest })
    })
    return [...seen.values()].filter((contact) => `${contact.name ?? ''} ${contact.address}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.messages - a.messages)
  },
  contacts: (query: string): Contact[] => {
    const seen = new Map<string, Contact>()
    MESSAGES.forEach((message) => seen.set(message.from, { name: message.fromName, address: message.from }))
    return [...seen.values()].filter((contact) => `${contact.name ?? ''} ${contact.address}`.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
  },
  change: (ids: string[], fields: Partial<Pick<Message, 'unread' | 'starred' | 'shelf' | 'snoozedUntil'>>): Message[] => ids.map((id) => ({ ...Object.assign(found(id), fields) })),
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
