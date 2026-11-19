/**
 * Where mail comes from and how it goes out. Receiving: Cloudflare for your own domains, or an existing mailbox pulled
 * over IMAP. Sending: a provider's API, or SMTP, as any address on a domain it has verified. Gmail and Outlook do both
 * after one sign-in. None is wired to Rust yet: the forms collect nothing until the sync step lands, and say so.
 */

export const INTEGRATION_IDS = [
  'cloudflare',
  'gmail',
  'outlook',
  'proton',
  'icloud',
  'zoho',
  'imap',
  'file',
  'resend',
  'ses',
  'mailgun',
  'brevo',
  'sparkpost',
  'smtp',
] as const
export type IntegrationId = (typeof INTEGRATION_IDS)[number]

export const DIRECTIONS = ['receive', 'send'] as const
export type Direction = (typeof DIRECTIONS)[number]

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
  /** Which lists it shows in. Gmail and Outlook show in both. */
  directions: readonly Direction[]
  method: IntegrationMethod
}

const API_KEY: IntegrationField = { id: 'key', label: 'API key', type: 'password' }
const IMAP_LOGIN: readonly IntegrationField[] = [
  { id: 'user', label: 'Username', type: 'text' },
  { id: 'password', label: 'Password', type: 'password' },
]

export const INTEGRATIONS: readonly Integration[] = [
  {
    id: 'cloudflare',
    name: 'Cloudflare Email Routing',
    summary: 'Your own domains through one catch-all Worker. Every message keeps its exact recipient.',
    directions: ['receive'],
    method: {
      kind: 'form',
      fields: [
        { id: 'account', label: 'Account ID', type: 'text', placeholder: '32 hex characters', hint: 'Cloudflare dashboard, any zone, right-hand column.' },
        { id: 'token', label: 'API token', type: 'password', hint: 'Needs Email Routing Rules: Edit and Workers Scripts: Edit.' },
      ],
    },
  },
  { id: 'gmail', name: 'Gmail', summary: 'Read and send as your Google address after signing in with Google.', directions: ['receive', 'send'], method: { kind: 'oauth', provider: 'Google' } },
  { id: 'outlook', name: 'Outlook', summary: 'Read and send as your Microsoft address after signing in with Microsoft.', directions: ['receive', 'send'], method: { kind: 'oauth', provider: 'Microsoft' } },
  {
    id: 'proton',
    name: 'Proton Mail',
    summary: 'Through Proton Bridge running on this computer.',
    directions: ['receive'],
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
    directions: ['receive'],
    method: {
      kind: 'form',
      fields: [
        { id: 'user', label: 'Apple ID email', type: 'text' },
        { id: 'password', label: 'App-specific password', type: 'password', hint: 'Make one at account.apple.com, Sign-In and Security.' },
      ],
    },
  },
  { id: 'zoho', name: 'Zoho Mail', summary: 'IMAP with an app password from Zoho Accounts.', directions: ['receive'], method: { kind: 'form', fields: IMAP_LOGIN } },
  {
    id: 'imap',
    name: 'Other IMAP',
    summary: 'Any provider that speaks IMAP over TLS.',
    directions: ['receive'],
    method: {
      kind: 'form',
      fields: [{ id: 'host', label: 'Server', type: 'text', placeholder: 'imap.example.com' }, { id: 'port', label: 'Port', type: 'number', placeholder: '993' }, ...IMAP_LOGIN],
    },
  },
  { id: 'file', name: 'Import a file', summary: 'Messages exported from another client, as .eml or .mbox.', directions: ['receive'], method: { kind: 'file', accept: '.eml,.mbox,message/rfc822,application/mbox' } },
  {
    id: 'resend',
    name: 'Resend',
    summary: 'Send as any address on a domain verified in Resend.',
    directions: ['send'],
    method: { kind: 'form', fields: [{ ...API_KEY, placeholder: 're_...', hint: 'A sending-access key is enough.' }] },
  },
  {
    id: 'ses',
    name: 'Amazon SES',
    summary: 'Send through SES in the region your domains are verified in.',
    directions: ['send'],
    method: {
      kind: 'form',
      fields: [
        { id: 'region', label: 'Region', type: 'text', placeholder: 'eu-west-1' },
        { id: 'access', label: 'Access key ID', type: 'text' },
        { id: 'secret', label: 'Secret access key', type: 'password', hint: 'An IAM user with ses:SendRawEmail only.' },
      ],
    },
  },
  {
    id: 'mailgun',
    name: 'Mailgun',
    summary: 'Send through a Mailgun domain, US or EU.',
    directions: ['send'],
    method: { kind: 'form', fields: [{ id: 'domain', label: 'Sending domain', type: 'text', placeholder: 'mg.example.com' }, { id: 'region', label: 'Region', type: 'text', placeholder: 'us or eu' }, API_KEY] },
  },
  { id: 'brevo', name: 'Brevo', summary: 'Send transactional mail through Brevo.', directions: ['send'], method: { kind: 'form', fields: [API_KEY] } },
  { id: 'sparkpost', name: 'SparkPost', summary: 'Send through SparkPost or Bird.', directions: ['send'], method: { kind: 'form', fields: [API_KEY] } },
  {
    id: 'smtp',
    name: 'SMTP',
    summary: 'Any server that relays mail over TLS.',
    directions: ['send'],
    method: {
      kind: 'form',
      fields: [{ id: 'host', label: 'Server', type: 'text', placeholder: 'smtp.example.com' }, { id: 'port', label: 'Port', type: 'number', placeholder: '465' }, ...IMAP_LOGIN],
    },
  },
]

/** What every connect form says until the Rust side can take it. */
export const NOT_WIRED_NOTE = 'Connecting arrives with the sync step. Nothing typed here is saved or sent.'
