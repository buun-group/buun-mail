import { invoke, isTauri } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'

import { COMMANDS } from './commands'
import { previewMessages, previewWorkspaces } from './preview'
import type { Message, Place, Workspace } from './types'

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

/** Opens a page in the person's browser, never inside the app. The desktop allows only the product sites. */
export async function openExternal(href: string): Promise<void> {
  if (isTauri()) {
    await openUrl(href)
    return
  }
  window.open(href, '_blank', 'noopener,noreferrer')
}
