/**
 * Where mail can come from. Cloudflare is the primary path (your own domains through one catch-all Worker); the rest
 * pull an existing mailbox in. Each names the fields its connect form asks for. None is wired to Rust yet: the forms
 * collect nothing until the sync step lands, and say so.
 */

export const INTEGRATION_IDS = ['cloudflare', 'gmail', 'outlook', 'proton', 'icloud', 'imap', 'file'] as const
export type IntegrationId = (typeof INTEGRATION_IDS)[number]

export interface IntegrationField {
  id: string
  label: string
  type: 'text' | 'password' | 'number'
  placeholder?: string
  hint?: string
}

export type IntegrationMethod = { kind: 'form'; fields: readonly IntegrationField[] } | { kind: 'oauth'; provider: string } | { kind: 'file'; accept: string }

export interface Integration {
  id: IntegrationId
  name: string
  summary: string
  method: IntegrationMethod
}

export const INTEGRATIONS: readonly Integration[] = [
  {
    id: 'cloudflare',
    name: 'Cloudflare Email Routing',
    summary: 'Your own domains, through one catch-all Worker. Every address keeps its exact recipient.',
    method: {
      kind: 'form',
      fields: [
        { id: 'account', label: 'Account ID', type: 'text', placeholder: '32 hex characters', hint: 'Cloudflare dashboard, any zone, right-hand column.' },
        { id: 'token', label: 'API token', type: 'password', hint: 'Needs Email Routing Rules: Edit and Workers Scripts: Edit.' },
      ],
    },
  },
  { id: 'gmail', name: 'Gmail', summary: 'Pull a Google mailbox over IMAP after signing in with Google.', method: { kind: 'oauth', provider: 'Google' } },
  { id: 'outlook', name: 'Outlook', summary: 'Pull a Microsoft mailbox over IMAP after signing in with Microsoft.', method: { kind: 'oauth', provider: 'Microsoft' } },
  {
    id: 'proton',
    name: 'Proton Mail',
    summary: 'Through Proton Bridge running on this computer.',
    method: {
      kind: 'form',
      fields: [
        { id: 'host', label: 'Bridge host', type: 'text', placeholder: '127.0.0.1' },
        { id: 'port', label: 'IMAP port', type: 'number', placeholder: '1143' },
        { id: 'user', label: 'Bridge username', type: 'text' },
        { id: 'password', label: 'Bridge password', type: 'password', hint: 'The one Bridge shows, not your Proton password.' },
      ],
    },
  },
  {
    id: 'icloud',
    name: 'iCloud Mail',
    summary: 'IMAP with an app-specific password.',
    method: {
      kind: 'form',
      fields: [
        { id: 'user', label: 'Apple ID email', type: 'text' },
        { id: 'password', label: 'App-specific password', type: 'password', hint: 'Make one at account.apple.com, Sign-In and Security.' },
      ],
    },
  },
  {
    id: 'imap',
    name: 'Other IMAP',
    summary: 'Any provider that speaks IMAP over TLS.',
    method: {
      kind: 'form',
      fields: [
        { id: 'host', label: 'Server', type: 'text', placeholder: 'imap.example.com' },
        { id: 'port', label: 'Port', type: 'number', placeholder: '993' },
        { id: 'user', label: 'Username', type: 'text' },
        { id: 'password', label: 'Password', type: 'password' },
      ],
    },
  },
  { id: 'file', name: 'Import a file', summary: 'Messages exported from another client, as .eml or .mbox.', method: { kind: 'file', accept: '.eml,.mbox,message/rfc822,application/mbox' } },
]

/** What every connect form says until the Rust side can take it. */
export const NOT_WIRED_NOTE = 'Connecting arrives with the sync step. Nothing typed here is saved or sent.'
