import type { SmtpSecurity } from '../api/types'

/** A mail provider's servers for reading (IMAP) and sending (SMTP), so a person only types their address and app password. */
export interface MailServers {
  imap: { host: string; port: number; security: SmtpSecurity }
  smtp: { host: string; port: number; security: SmtpSecurity }
}

export const MAIL_PRESETS = {
  gmail: { imap: { host: 'imap.gmail.com', port: 993, security: 'tls' }, smtp: { host: 'smtp.gmail.com', port: 465, security: 'tls' } },
  icloud: { imap: { host: 'imap.mail.me.com', port: 993, security: 'tls' }, smtp: { host: 'smtp.mail.me.com', port: 587, security: 'startTls' } },
  fastmail: { imap: { host: 'imap.fastmail.com', port: 993, security: 'tls' }, smtp: { host: 'smtp.fastmail.com', port: 465, security: 'tls' } },
  zoho: { imap: { host: 'imap.zoho.com', port: 993, security: 'tls' }, smtp: { host: 'smtp.zoho.com', port: 465, security: 'tls' } },
  proton: { imap: { host: '127.0.0.1', port: 1143, security: 'none' }, smtp: { host: '127.0.0.1', port: 1025, security: 'none' } },
  custom: { imap: { host: '', port: 993, security: 'tls' }, smtp: { host: '', port: 465, security: 'tls' } },
} as const satisfies Record<string, MailServers>

export type MailPreset = keyof typeof MAIL_PRESETS

export const MAIL_PRESET_IDS = Object.keys(MAIL_PRESETS) as MailPreset[]
