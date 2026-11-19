import { invoke, isTauri } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { openUrl } from '@tauri-apps/plugin-opener'

import { COMMANDS, IMPORT_EXTENSIONS } from './commands'
import { previewDetail, previewMessages, previewWorkspaces } from './preview'
import type { ImportReport, Message, MessageDetail, Place, Workspace } from './types'

/**
 * The one door to the Rust side. In the desktop app every call is a Tauri command; in a plain browser (`pnpm dev:ui`)
 * the preview mailbox answers instead, so the UI can be worked on without building Rust.
 */

export async function listWorkspaces(): Promise<Workspace[]> {
  return isTauri() ? invoke<Workspace[]>(COMMANDS.listWorkspaces) : previewWorkspaces()
}

export async function listMessages(place: Place): Promise<Message[]> {
  return isTauri() ? invoke<Message[]>(COMMANDS.listMessages, { workspace: place.workspace, folder: place.folder }) : previewMessages(place)
}

/** Opens a message: its text, and it is marked read. */
export async function openMessage(id: string): Promise<MessageDetail> {
  return isTauri() ? invoke<MessageDetail>(COMMANDS.openMessage, { id }) : previewDetail(id)
}

/** Marks a folder read, or the whole workspace. Resolves to how many changed. */
export async function markAllRead(place: Place, wholeWorkspace: boolean): Promise<number> {
  return isTauri() ? invoke<number>(COMMANDS.markAllRead, { workspace: place.workspace, folder: place.folder, wholeWorkspace }) : 0
}

/**
 * Asks for .eml and .mbox files and imports them. Resolves to null when the person cancels, or in a plain browser,
 * where there is no store to import into.
 */
export async function importFiles(): Promise<ImportReport | null> {
  if (!isTauri()) return null
  const picked = await open({ multiple: true, directory: false, filters: [{ name: 'Email', extensions: [...IMPORT_EXTENSIONS] }] })
  if (picked === null || picked.length === 0) return null
  return invoke<ImportReport>(COMMANDS.importFiles, { paths: picked })
}

/** Where the routing file lives, or null in a plain browser. */
export async function routingPath(): Promise<string | null> {
  return isTauri() ? invoke<string>(COMMANDS.routingPath) : null
}

/** Opens a page in the person's browser, never inside the app. The desktop allows only the product sites. */
export async function openExternal(href: string): Promise<void> {
  if (isTauri()) {
    await openUrl(href)
    return
  }
  window.open(href, '_blank', 'noopener,noreferrer')
}
