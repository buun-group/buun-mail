import type { ParseKeys } from 'i18next'

/**
 * Where mail comes from and how it goes out. Receiving: Cloudflare for your own domains, or an existing mailbox pulled
 * over IMAP. Sending: a provider's API, or SMTP, from any address on a domain it has verified. Gmail and Outlook do both
 * after one sign-in. The words are translation keys into `locales/<language>/integrations.json`; ids, field types and
 * sample values stay here. None is wired to Rust yet: the forms collect nothing until the sync step lands, and say so.
 */

export const INTEGRATION_IDS = [
  'gateway',
  'dissolve',
  'cryptflare',
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
  'slack',
  'discord',
  'ntfy',
  'telegram',
  'webhook',
  'alertEmail',
  'sms',
] as const
export type IntegrationId = (typeof INTEGRATION_IDS)[number]

export const DIRECTIONS = ['receive', 'send', 'alert', 'store'] as const
export type Direction = (typeof DIRECTIONS)[number]

/** A key in the `integrations` strings. */
export type IntegrationKey = ParseKeys<'integrations'>

export interface IntegrationField {
  id: string
  label: IntegrationKey
  type: 'text' | 'password' | 'number'
  /** Words to show in the empty field. */
  placeholder?: IntegrationKey
  /** A sample value to show in the empty field instead, such as a host or a port. Never translated. */
  sample?: string
  hint?: IntegrationKey
}

import type { AlertKind } from '../api/types'
import type { MailPreset } from './mailServers'

export type IntegrationMethod = { kind: 'form'; fields: readonly IntegrationField[] } | { kind: 'oauth'; provider: string } | { kind: 'file'; accept: string } | { kind: 'gateway' } | { kind: 'resend' } | { kind: 'smtp' } | { kind: 'mailbox'; preset: MailPreset } | { kind: 'dissolve' } | { kind: 'cryptflare' } | { kind: 'alert'; alert: AlertKind }

export interface Integration {
  id: IntegrationId
  name: IntegrationKey
  summary: IntegrationKey
  /** Which lists it shows in. Gmail and Outlook show in both. */
  directions: readonly Direction[]
  method: IntegrationMethod
}

const API_KEY: IntegrationField = { id: 'key', label: 'fields.apiKey', type: 'password' }

export const INTEGRATIONS: readonly Integration[] = [
  { id: 'gateway', name: 'providers.gateway.name', summary: 'providers.gateway.summary', directions: ['receive'], method: { kind: 'gateway' } },
  { id: 'dissolve', name: 'providers.dissolve.name', summary: 'providers.dissolve.summary', directions: ['receive'], method: { kind: 'dissolve' } },
  { id: 'cryptflare', name: 'providers.cryptflare.name', summary: 'providers.cryptflare.summary', directions: ['store'], method: { kind: 'cryptflare' } },
  {
    id: 'cloudflare',
    name: 'providers.cloudflare.name',
    summary: 'providers.cloudflare.summary',
    directions: ['receive'],
    method: {
      kind: 'form',
      fields: [
        { id: 'account', label: 'fields.cloudflareAccount', type: 'text', placeholder: 'fields.cloudflareAccountPlaceholder', hint: 'fields.cloudflareAccountHint' },
        { id: 'token', label: 'fields.cloudflareToken', type: 'password', hint: 'fields.cloudflareTokenHint' },
      ],
    },
  },
  { id: 'gmail', name: 'providers.gmail.name', summary: 'providers.gmail.summary', directions: ['receive', 'send'], method: { kind: 'mailbox', preset: 'gmail' } },
  { id: 'outlook', name: 'providers.outlook.name', summary: 'providers.outlook.summary', directions: ['receive', 'send'], method: { kind: 'oauth', provider: 'Microsoft' } },
  { id: 'proton', name: 'providers.proton.name', summary: 'providers.proton.summary', directions: ['receive', 'send'], method: { kind: 'mailbox', preset: 'proton' } },
  { id: 'icloud', name: 'providers.icloud.name', summary: 'providers.icloud.summary', directions: ['receive', 'send'], method: { kind: 'mailbox', preset: 'icloud' } },
  { id: 'zoho', name: 'providers.zoho.name', summary: 'providers.zoho.summary', directions: ['receive', 'send'], method: { kind: 'mailbox', preset: 'zoho' } },
  { id: 'imap', name: 'providers.imap.name', summary: 'providers.imap.summary', directions: ['receive'], method: { kind: 'mailbox', preset: 'custom' } },
  { id: 'file', name: 'providers.file.name', summary: 'providers.file.summary', directions: ['receive'], method: { kind: 'file', accept: '.eml,.mbox,message/rfc822,application/mbox' } },
  {
    id: 'resend',
    name: 'providers.resend.name',
    summary: 'providers.resend.summary',
    directions: ['send'],
    method: { kind: 'resend' },
  },
  {
    id: 'ses',
    name: 'providers.ses.name',
    summary: 'providers.ses.summary',
    directions: ['send'],
    method: {
      kind: 'form',
      fields: [
        { id: 'region', label: 'fields.region', type: 'text', sample: 'eu-west-1' },
        { id: 'access', label: 'fields.sesAccess', type: 'text' },
        { id: 'secret', label: 'fields.sesSecret', type: 'password', hint: 'fields.sesSecretHint' },
      ],
    },
  },
  {
    id: 'mailgun',
    name: 'providers.mailgun.name',
    summary: 'providers.mailgun.summary',
    directions: ['send'],
    method: {
      kind: 'form',
      fields: [{ id: 'domain', label: 'fields.mailgunDomain', type: 'text', sample: 'mg.example.com' }, { id: 'region', label: 'fields.region', type: 'text', placeholder: 'fields.mailgunRegionPlaceholder' }, API_KEY],
    },
  },
  { id: 'brevo', name: 'providers.brevo.name', summary: 'providers.brevo.summary', directions: ['send'], method: { kind: 'form', fields: [API_KEY] } },
  { id: 'sparkpost', name: 'providers.sparkpost.name', summary: 'providers.sparkpost.summary', directions: ['send'], method: { kind: 'form', fields: [API_KEY] } },
  {
    id: 'smtp',
    name: 'providers.smtp.name',
    summary: 'providers.smtp.summary',
    directions: ['send'],
    method: { kind: 'smtp' },
  },
  { id: 'slack', name: 'providers.slack.name', summary: 'providers.slack.summary', directions: ['alert'], method: { kind: 'alert', alert: 'slack' } },
  { id: 'discord', name: 'providers.discord.name', summary: 'providers.discord.summary', directions: ['alert'], method: { kind: 'alert', alert: 'discord' } },
  { id: 'ntfy', name: 'providers.ntfy.name', summary: 'providers.ntfy.summary', directions: ['alert'], method: { kind: 'alert', alert: 'ntfy' } },
  { id: 'telegram', name: 'providers.telegram.name', summary: 'providers.telegram.summary', directions: ['alert'], method: { kind: 'alert', alert: 'telegram' } },
  { id: 'sms', name: 'providers.sms.name', summary: 'providers.sms.summary', directions: ['alert'], method: { kind: 'alert', alert: 'sms' } },
  { id: 'alertEmail', name: 'providers.alertEmail.name', summary: 'providers.alertEmail.summary', directions: ['alert'], method: { kind: 'alert', alert: 'email' } },
  { id: 'webhook', name: 'providers.webhook.name', summary: 'providers.webhook.summary', directions: ['alert'], method: { kind: 'alert', alert: 'webhook' } },
]

/** What every connect form says until the Rust side can take it. */
export const NOT_WIRED_NOTE: IntegrationKey = 'notWired'
