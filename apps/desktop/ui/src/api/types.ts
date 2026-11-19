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
  tags: string[]
}

/** Where the list is pointed: one folder of one workspace. */
export interface Place {
  workspace: string
  folder: string | null
}

/** An open message: its summary and its readable text. */
export interface MessageDetail {
  message: Message
  body: string
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

/** The mail gateway connection, as Settings shows it. Mirrors `GatewayStatusDto` in `src-tauri/src/sync/service.rs`. */
export interface GatewayStatus {
  connected: boolean
  url: string | null
  lastChecked: string | null
  received: number
  problem: string | null
}
