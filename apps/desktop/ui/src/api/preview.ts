import type { Message, MessageDetail, Place, Workspace } from './types'

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
    preview: 'Invoice INV-2026-11 is now available. Amount due on 1 December.', receivedAt: '2026-11-19T07:42:00Z', unread: true,
  },
  {
    id: 'p2', workspace: 'buun', folder: null, fromName: 'A client', from: 'projects@client.example', to: 'hello@buungroup.com',
    matched: '*@buungroup.com', folderMatched: null, subject: 'Quote for the booking site',
    preview: 'Could you send the quote through by Friday so we can sign off?', receivedAt: '2026-11-18T23:05:00Z', unread: true,
  },
  {
    id: 'p3', workspace: 'plotwork', folder: null, fromName: 'A Plotwork team', from: 'lead@team.example', to: 'support@plotwork.dev',
    matched: '*@plotwork.dev', folderMatched: null, subject: 'Sequence diagrams in the board',
    preview: 'Is there a way to pin a sequence diagram to a tab?', receivedAt: '2026-11-18T21:14:00Z', unread: true,
  },
  {
    id: 'p4', workspace: 'personal', folder: null, fromName: 'A friend', from: 'friend@mail.example', to: 'me@personal.example',
    matched: '*@personal.example', folderMatched: null, subject: 'Saturday',
    preview: 'Still on for Saturday? We could do the coastal walk.', receivedAt: '2026-11-18T19:55:00Z', unread: false,
  },
]

export function previewWorkspaces(): Workspace[] {
  return WORKSPACES
}

export function previewMessages(place: Place): Message[] {
  return MESSAGES.filter((message) => message.workspace === place.workspace && message.folder === place.folder)
}

export function previewDetail(id: string): MessageDetail {
  const message = MESSAGES.find((item) => item.id === id) ?? MESSAGES[0]
  if (message === undefined) throw new Error('The preview mailbox is empty.')
  return { message: { ...message, unread: false }, body: message.preview }
}
