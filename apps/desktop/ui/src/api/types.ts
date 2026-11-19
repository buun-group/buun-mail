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
