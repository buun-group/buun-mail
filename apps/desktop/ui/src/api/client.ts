import { invoke, isTauri } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { openUrl } from '@tauri-apps/plugin-opener'

import { COMMANDS, IMPORT_EXTENSIONS } from './commands'
import { preview, previewDetail, previewMessages, previewWorkspaces } from './preview'
import type { Activity, AgentStatus, ImportReport, Message, MessageDetail, Place, Rule, TagCount, Workspace } from './types'

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

/** Adds tags to a message and returns it. */
export async function tagMessage(id: string, tags: string[]): Promise<Message> {
  return isTauri() ? invoke<Message>(COMMANDS.tagMessage, { id, tags }) : preview.tag(id, tags)
}

/** Removes a tag from a message and returns it. */
export async function untagMessage(id: string, tag: string): Promise<Message> {
  return isTauri() ? invoke<Message>(COMMANDS.untagMessage, { id, tag }) : preview.untag(id, tag)
}

/** Every tag in use. */
export async function listTags(): Promise<TagCount[]> {
  return isTauri() ? invoke<TagCount[]>(COMMANDS.listTags) : preview.tags()
}

/** Every rule, in run order. */
export async function listRules(): Promise<Rule[]> {
  return isTauri() ? invoke<Rule[]>(COMMANDS.listRules) : preview.rules()
}

/** Adds or replaces a rule. Rejects with the reason when the rule is not valid. */
export async function saveRule(rule: Rule): Promise<Rule> {
  return isTauri() ? invoke<Rule>(COMMANDS.saveRule, { rule }) : preview.saveRule(rule)
}

/** Deletes a rule. */
export async function deleteRule(id: string): Promise<boolean> {
  return isTauri() ? invoke<boolean>(COMMANDS.deleteRule, { id }) : preview.deleteRule(id)
}

/** Runs every rule over mail already stored. Resolves to how many messages changed. */
export async function applyRules(): Promise<number> {
  return isTauri() ? invoke<number>(COMMANDS.applyRules) : 0
}

/** The latest changes by people, rules and agents. */
export async function listActivity(limit: number): Promise<Activity[]> {
  return isTauri() ? invoke<Activity[]>(COMMANDS.listActivity, { limit }) : preview.activity()
}

/** Agent access status, or a stand-in in a plain browser. */
export async function agentStatus(): Promise<AgentStatus> {
  return isTauri() ? invoke<AgentStatus>(COMMANDS.agentStatus) : preview.agent()
}

/** Turns agent access on or off. */
export async function setAgentEnabled(enabled: boolean): Promise<AgentStatus> {
  return isTauri() ? invoke<AgentStatus>(COMMANDS.setAgentEnabled, { enabled }) : preview.setAgent(enabled)
}

/** Makes a new agent token. */
export async function regenerateAgentToken(): Promise<AgentStatus> {
  return isTauri() ? invoke<AgentStatus>(COMMANDS.regenerateAgentToken) : preview.agent()
}
