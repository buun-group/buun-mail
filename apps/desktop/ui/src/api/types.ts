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
}

/** Where a message sits: in its folder, archived, or in the trash. It keeps its workspace and folder throughout. */
export type Shelf = 'active' | 'archived' | 'trashed'

/** A list across every workspace. Drafts live on this computer only, so the Rust side never sees that view. */
export type MailView = 'starred' | 'snoozed' | 'archive' | 'trash' | 'drafts' | 'contacts'

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
}

/** What a rule does. */
export type RuleAction = { type: 'tag'; tag: string } | { type: 'move'; workspace?: string; folder?: string } | { type: 'markRead' } | { type: 'quiet' }

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
  token: string
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
  kind: 'resend'
  /** The key's last four characters. */
  keyHint: string
  restricted: boolean
  domains: SenderDomain[]
  signature: string
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
