/**
 * What the Rust side sends. Mirrors `apps/desktop/src-tauri/src/dto.rs`; change both together.
 */

/** A folder in a workspace. `name` is null for the inbox. */
export interface Folder {
  name: string | null
  /** A glyph key from the routing file, null for the default. */
  icon: string | null
  unread: number
}

/** A workspace in the sidebar: usually one business. */
export interface Workspace {
  id: string
  name: string
  /** A glyph key from the routing file, null for the initial. */
  icon: string | null
  addresses: string[]
  folders: Folder[]
  unread: number
  /** True for a workspace the routing file defines, which Settings can edit and delete. */
  editable: boolean
}

/** One workspace as the routing file writes it, for the editor. A new one has no id yet. */
export interface WorkspaceEdit {
  id: string | null
  name: string
  addresses: string[]
  folders: { name: string; from: string; icon: string | null }[]
}

/** A message, already placed by the router. */
export interface Message {
  id: string
  workspace: string
  folder: string | null
  fromName: string
  from: string
  to: string
  matched: string | null
  folderMatched: string | null
  subject: string
  preview: string
  receivedAt: string
  unread: boolean
  starred: boolean
  shelf: Shelf
  tags: string[]
  /** Its conversation, once linked. */
  threadId: string | null
  /** How many messages outside the trash share its conversation, itself included. */
  threadSize: number
  /** When it comes back from a snooze, ISO time; null when not snoozed. */
  snoozedUntil: string | null
  /** The raw message's size in bytes, once known. */
  size: number | null
  /** The receiving server's sender checks, when the message carries them. */
  checks: Authentication | null
}

/** Where a message sits: in its folder, archived, or in the trash. It keeps its workspace and folder throughout. */
export type Shelf = 'active' | 'archived' | 'trashed'

/** A list across every workspace. Drafts live on this computer only, so the Rust side never sees that view. */
export type MailView = 'all' | 'scheduled' | 'starred' | 'snoozed' | 'archive' | 'trash' | 'drafts' | 'contacts'

/** Where the list is pointed: one folder of one workspace. */
export interface Place {
  workspace: string
  folder: string | null
}

/** An open message: its summary and its readable text. */
export interface MessageDetail {
  message: Message
  body: string
  recipients: Recipients
  /** Its HTML, inline images embedded, or null for a plain-text message. */
  html: { html: string; remote: number } | null
  attachments: Attachment[]
  /** SPF, DKIM and DMARC as the receiving server found them, or null when the message does not say. */
  authentication: Authentication | null
  /** How to leave the list it came from, or null when it does not say. */
  unsubscribe: Unsubscribe | null
}

/** How to leave a mailing list. Mirrors `UnsubscribeDto`. */
export interface Unsubscribe {
  web: string | null
  oneClick: boolean
  mailTo: string | null
  mailSubject: string | null
  mailBody: string | null
}

/** Mirrors `AuthenticationDto`. */
export interface Authentication {
  verdict: 'verified' | 'failed' | 'unclear'
  by: string | null
  spf: 'pass' | 'fail' | 'other' | null
  dkim: 'pass' | 'fail' | 'other' | null
  dmarc: 'pass' | 'fail' | 'other' | null
}

/** One attachment of an open message. Mirrors `AttachmentDto`. */
export interface Attachment {
  index: number
  name: string
  mime: string
  size: number
  /** A picture shown inside the HTML. */
  inline: boolean
}

/** One person on a message. Mirrors `ContactDto`. */
export interface Contact {
  name: string | null
  address: string
}

/** The To, Cc and Reply-To headers of an open message. Mirrors `RecipientsDto`. */
export interface Recipients {
  to: Contact[]
  cc: Contact[]
  replyTo: Contact[]
}

/** One thing an import could not take in. */
export interface ImportFailure {
  source: string
  reason: string
}

/** What an import did. */
export interface ImportReport {
  added: number
  duplicates: number
  failed: ImportFailure[]
}

/** When a rule applies. Every condition given must hold. Mirrors `crates/rules/src/rule.rs`. */
export interface RuleWhen {
  workspace?: string
  from?: string
  to?: string
  subjectContains?: string
  /** Text the message's words contain. */
  bodyContains?: string
  /** A tag it carries, from an earlier rule or added by hand. */
  tagged?: string
}

/** What a rule does. */
export type RuleAction = { type: 'tag'; tag: string } | { type: 'move'; workspace?: string; folder?: string } | { type: 'markRead' } | { type: 'quiet' } | { type: 'trash' } | { type: 'saveAttachments'; folder: string } | { type: 'alert'; channel: string }

/** A rule, as the app, the settings screen and agents all write it. */
export interface Rule {
  id: string
  name: string
  enabled: boolean
  when: RuleWhen
  actions: RuleAction[]
}

/** A tag and how many messages carry it. */
export interface TagCount {
  tag: string
  count: number
}

/** One change in the activity log. `actor` is `you`, `rule:<name>` or `agent:<name>`. */
export interface Activity {
  at: string
  actor: string
  action: string
  detail: string
}

/** Agent access, as Settings shows it. */
export interface AgentStatus {
  enabled: boolean
  running: boolean
  url: string
  /** The token's last four characters; the token itself comes only through a reveal. */
  tokenHint: string
  problem: string | null
}

/** One mail gateway, as Settings shows it. Mirrors `GatewayStatusDto` in `src-tauri/src/sync/service.rs`. */
export interface GatewayStatus {
  id: string
  name: string
  url: string
  lastChecked: string | null
  received: number
  problem: string | null
}

/** What Check now found. Mirrors `CheckReportDto` in `src-tauri/src/sync/service.rs`. */
export interface CheckReport {
  arrived: number
  gateways: GatewayStatus[]
}

/** A domain the gateway receives for, and whether Cloudflare really sends its mail there. */
export interface GatewayDomain {
  domain: string
  /** How its mail reaches the gateway: that account's catch-all, or a relay in another account. */
  via: 'catch_all' | 'relay'
  routedHere: boolean | null
  previously: string | null
}

/** A domain in the gateway's Cloudflare account that could be added, with what its catch-all does now. */
export interface AvailableDomain {
  domain: string
  catchAllNow: string
}

/** A domain a sender may send from. Mirrors `SenderDomain`. */
export interface SenderDomain {
  name: string
  /** Resend's word for its state (`verified`, `pending`, `failed`...), or `entered` when typed for a sending-only key. */
  status: string
}

/** A connected sender, without its key. Mirrors `SenderDto`. */
export interface Sender {
  id: string
  name: string
  kind: 'resend' | 'smtp'
  /** The key's last four characters; empty for a mail server. */
  keyHint: string
  restricted: boolean
  domains: SenderDomain[]
  signature: string
  /** The mail server, for an SMTP sender; never its password. */
  smtp: SmtpServer | null
}

/** How the connection to a mail server is protected. */
export type SmtpSecurity = 'tls' | 'startTls' | 'none'

/** A mail server for sending. Mirrors `SmtpServer`. */
export interface SmtpServer {
  host: string
  port: number
  security: SmtpSecurity
  username: string
}

/** A domain mail can be sent from now, and its sender's signature. Mirrors `SendableDto`. */
export interface Sendable {
  domain: string
  signature: string
}

/** A message to send. Mirrors `DraftDto`. */
export interface Draft {
  from: Contact
  to: Contact[]
  cc: Contact[]
  bcc: Contact[]
  subject: string
  text: string
  /** The stored message this answers, for its thread. */
  replyToMessage: string | null
  /** Files sent with it. */
  attachments: FileToSend[]
}

/** A file to send: from this computer (`path`), or an attachment of a stored message (`fromMessage`). Mirrors `FileInput`. */
export interface FileToSend {
  name: string
  size: number
  path?: string
  fromMessage?: [string, number]
}

/** Why a send failed, and whether the same message may go through later. Mirrors `SendFailure`. */
export interface SendFailure {
  retry: boolean
  message: string
}

/** Someone the mailbox knows. Mirrors `KnownContactDto`. */
export interface KnownContact {
  name: string | null
  address: string
  messages: number
  latest: string
}

/** An IMAP mailbox collected from, without its password. Mirrors `ImapAccountDto`. */
export interface ImapAccount {
  id: string
  name: string
  host: string
  port: number
  username: string
  folder: string
  lastChecked: string | null
  received: number
  problem: string | null
}

/** A dissolve.email inbox. Mirrors `DissolveInboxDto`. */
export interface DissolveInbox {
  id: string
  /** Its address, which is also its folder's name. */
  address: string
  name: string | null
  /** When it ends, RFC 3339. */
  expiresAt: string
  /** True once it ended on dissolve.email and its mail was kept here. */
  ended: boolean
  /** Messages of it stored here. */
  stored: number
  /** Its extensions, as dissolve.email last reported them. */
  extensions: DissolveExtensions | null
  /** True when it is known to have an agent identity. */
  identity: boolean
}

/** A new inbox, with the identity made with it or why there is none. Mirrors `MadeInboxDto`. */
export interface MadeDissolveInbox extends DissolveInbox {
  identityMade: DissolveIdentity | null
  /** Why an identity asked for was not made, in dissolve.email's words. */
  identitySkipped: string | null
}

/** A made-up person's postal address. Mirrors `PersonaAddress`. */
export interface PersonaAddress {
  street: string
  city: string
  state: string
  zip: string
  /** The whole address on lines, as the country writes it. */
  formatted: string
}

/** A synthetic person to fill in a sign-up form with; every value is made up. Mirrors `Persona`. */
export interface Persona {
  fullName: string
  firstName: string
  lastName: string
  username: string
  /** YYYY-MM-DD. */
  dateOfBirth: string
  /** Two letters, such as GB. */
  country: string
  address: PersonaAddress
  phone: string | null
}

/** An agent identity, never its password (that comes through `revealSecret('identity', inboxId)`). Mirrors `IdentityDto`. */
export interface DissolveIdentity {
  id: string
  /** The email to sign up with: the inbox's address. */
  email: string
  hasPassword: boolean
  persona: Persona | null
}

/** Agent identities on this plan and sign-in. Mirrors `DissolveIdentitiesDto`. */
export interface DissolveIdentities {
  /** Whether the plan includes them; null until dissolve.email has said. */
  plan: boolean | null
  /** True once the person approved them for this app. */
  granted: boolean
  /** Inboxes here with an identity, against the plan's cap. */
  live: Meter
  /** Make one with each new address. */
  withNew: boolean
}

/** An inbox's extensions. A null limit is unlimited or not reported. */
export interface DissolveExtensions {
  used: number | null
  limit: number | null
  canExtend: boolean | null
  availableAt: string | null
  /** Extensions left; null for unlimited or not reported. */
  left: number | null
  /** When the inbox ends for good, extensions or not, RFC 3339; null for no ceiling or not reported. */
  lifetimeEndsAt: string | null
  /** True once it reached the plan's longest life, so no extension adds more. */
  lifetimeReached: boolean | null
}

/** Another address that delivers into a dissolve.email inbox. Mirrors `Alias`. */
export interface DissolveAlias {
  id: string
  address: string
}

/** An agent identity in the account's list, never its password. Mirrors `IdentityRowDto`. */
export interface DissolveIdentityRow {
  id: string
  email: string
  label: string | null
  /** When it ends, RFC 3339. */
  expiresAt: string | null
  /** The inbox it lives in, when that inbox is a folder here. */
  inbox: string | null
}

/** A count against a limit. A negative limit is unlimited; null is not reported. Mirrors `Meter`. */
export interface Meter {
  used: number | null
  limit: number | null
  resetAt: string | null
}

/** The plan's limits and what is used of them. Mirrors `DissolveLimitsDto`. */
export interface DissolveLimits {
  plan: string | null
  inboxes: Meter
  inboxMinutes: number | null
  lifetimeMinutes: number | null
  extensionsPerInbox: number | null
  customNames: boolean | null
  hourlyCreations: Meter
  requests: Meter
  messageChecks: Meter
}

/** The dissolve.email connection, never a token. Mirrors `DissolveStatusDto`. */
export interface DissolveStatus {
  connected: boolean
  server: string
  email: string | null
  plan: string | null
  keepAfterExpiry: boolean
  inboxes: DissolveInbox[]
  lastChecked: string | null
  problem: string | null
  limits: DissolveLimits
  identities: DissolveIdentities
}

/** Whether a reveal code is set, and how many seconds reveals stay open. Mirrors `RevealStatusDto`. */
export interface RevealStatus {
  codeSet: boolean
  openFor: number
}

/** Where an alert goes. Mirrors `AlertKind`. */
export type AlertKind = 'slack' | 'discord' | 'ntfy' | 'telegram' | 'webhook' | 'email' | 'sms'

/** One alert channel, never its secret. Mirrors `AlertChannelDto`. */
export interface AlertChannel {
  id: string
  name: string
  kind: AlertKind
  fields: Record<string, string>
  hasSecret: boolean
  lastSent: string | null
  sent: number
  problem: string | null
}

/** Which saved secret to show: a gateway's token, a mailbox's password, a sender's key, an alert's secret. */
export type SecretKind = 'gateway' | 'imap' | 'sender' | 'alert' | 'agent' | 'identity'

/** A message scheduled to go later. Mirrors `ScheduledDto`. */
export interface ScheduledMessage {
  id: string
  from: string
  to: string[]
  subject: string
  /** When it goes, RFC 3339. */
  sendAt: string
  problem: string | null
}

/** A reminder to follow up on a sent message nobody answered. Mirrors `ReminderDto`. */
export interface Reminder {
  id: string
  messageId: string
  subject: string
  to: string
  /** When it is due, RFC 3339. */
  dueAt: string
}

/** A saved reply. Mirrors `Template`. */
export interface Template {
  id: string
  name: string
  /** The workspace it is for, or null for every workspace. */
  workspace: string | null
  subject: string
  text: string
}

/** A workspace's signature and address for new mail. Mirrors `Profile`. */
export interface Profile {
  signature: string
  from: string
}

/** Every template and profile. Mirrors `Writing`. */
export interface Writing {
  templates: Template[]
  profiles: Record<string, Profile>
}

/** Whether a newer release is out, from the project's releases page. */
export interface UpdateInfo {
  current: string
  latest: string
  /** True when `latest` is newer and its installer for this computer is attached. */
  newer: boolean
  /** True when `latest` is a beta. */
  beta: boolean
  /** The release's page, for its notes. */
  url: string
  /** The installer for this computer. */
  asset: string | null
  /** True when Install replaces this copy and restarts it; false when it downloads the installer to run. */
  inPlace: boolean
}

/** An installer saved to Downloads; `opens` is false for an AppImage, which is shown in its folder instead. */
export interface DownloadedUpdate {
  path: string
  opens: boolean
  /** True when it installed in place; the app restarts straight after, so this is rarely seen. */
  restarting: boolean
}
