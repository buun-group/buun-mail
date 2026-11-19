import { invoke, isTauri } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { openUrl } from '@tauri-apps/plugin-opener'

import type { ExportFormat } from '../constants/ui'
import { COMMANDS, IMPORT_EXTENSIONS } from './commands'
import { preview, previewDetail, previewMessages, previewView, previewWorkspaces } from './preview'
import type { Activity, AgentStatus, AvailableDomain, CheckReport, Contact, Draft, KnownContact, Sendable, Sender, GatewayDomain, GatewayStatus, ImportReport, MailView, Message, MessageDetail, Place, Rule, Shelf, TagCount, Workspace } from './types'

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

/** Starred, archived or trashed messages across every workspace. */
export async function listView(view: MailView): Promise<Message[]> {
  if (view === 'drafts' || view === 'contacts') return []
  return isTauri() ? invoke<Message[]>(COMMANDS.listView, { view }) : previewView(view)
}

/** Marks messages read or unread. Resolves to them as they are now. */
export async function setMessagesUnread(ids: string[], unread: boolean): Promise<Message[]> {
  return isTauri() ? invoke<Message[]>(COMMANDS.setMessagesUnread, { ids, unread }) : preview.change(ids, { unread })
}

/** Stars or unstars messages. Resolves to them as they are now. */
export async function setMessagesStarred(ids: string[], starred: boolean): Promise<Message[]> {
  return isTauri() ? invoke<Message[]>(COMMANDS.setMessagesStarred, { ids, starred }) : preview.change(ids, { starred })
}

/** Archives, trashes or puts back messages. Resolves to how many changed. */
export async function shelveMessages(ids: string[], shelf: Shelf): Promise<number> {
  return isTauri() ? invoke<number>(COMMANDS.shelveMessages, { ids, shelf }) : preview.change(ids, { shelf }).length
}

/** Deletes messages for good. Resolves to how many went. */
export async function deleteMessagesForever(ids: string[]): Promise<number> {
  return isTauri() ? invoke<number>(COMMANDS.deleteMessagesForever, { ids }) : preview.remove(ids)
}

/** Empties the trash. Resolves to how many went. */
export async function emptyTrash(): Promise<number> {
  return isTauri() ? invoke<number>(COMMANDS.emptyTrash) : preview.remove(previewView('trash').map((message) => message.id))
}

/** Moves a message to another folder. Resolves to it as it is now. */
export async function moveMessage(id: string, place: Place): Promise<Message> {
  return isTauri() ? invoke<Message>(COMMANDS.moveMessage, { id, workspace: place.workspace, folder: place.folder }) : preview.move(id, place)
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
 * where there is no store to import into. `filterName` is what the file picker calls those files, in the app's language.
 */
export async function importFiles(filterName: string): Promise<ImportReport | null> {
  if (!isTauri()) return null
  const picked = await open({ multiple: true, directory: false, filters: [{ name: filterName, extensions: [...IMPORT_EXTENSIONS] }] })
  if (picked === null || picked.length === 0) return null
  return invoke<ImportReport>(COMMANDS.importFiles, { paths: picked })
}

/**
 * Asks where to save, then writes the messages there in `format`. Resolves to the path written, or null when the person
 * cancels or in a plain browser, where there is no file system to write to.
 */
export async function exportMessages(ids: string[], format: ExportFormat, suggestedName: string, filterName: string): Promise<string | null> {
  if (!isTauri()) return null
  const extension = format === 'text' ? 'txt' : format
  const path = await save({ defaultPath: `${suggestedName}.${extension}`, filters: [{ name: filterName, extensions: [extension] }] })
  if (path === null) return null
  await invoke<number>(COMMANDS.exportMessages, { ids, format, path })
  return path
}

/** Asks where, then saves one attachment there. Resolves to the path, or null when cancelled or in a plain browser. */
export async function saveAttachment(id: string, index: number, name: string): Promise<string | null> {
  if (!isTauri()) return null
  const path = await save({ defaultPath: name })
  if (path === null) return null
  await invoke<string>(COMMANDS.saveAttachment, { id, index, path })
  return path
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

/** Every connected gateway. None in a plain browser. */
export async function listGateways(): Promise<GatewayStatus[]> {
  return isTauri() ? invoke<GatewayStatus[]>(COMMANDS.listGateways) : []
}

/** Checks and saves a gateway under a name. Rejects with the gateway's reason when it refuses. */
export async function addGateway(name: string, url: string, token: string): Promise<GatewayStatus[]> {
  return invoke<GatewayStatus[]>(COMMANDS.addGateway, { name, url, token })
}

/** Forgets one gateway. */
export async function removeGateway(id: string): Promise<GatewayStatus[]> {
  return invoke<GatewayStatus[]>(COMMANDS.removeGateway, { id })
}

/** Asks the sync to check every gateway now. */
/** Checks every gateway now. Resolves once the check is done, with what arrived. */
export async function checkGateways(): Promise<CheckReport> {
  return isTauri() ? invoke<CheckReport>(COMMANDS.checkGateways) : { arrived: 0, gateways: [] }
}

/** The domains one gateway receives for. */
export async function gatewayDomains(id: string): Promise<GatewayDomain[]> {
  return invoke<GatewayDomain[]>(COMMANDS.gatewayDomains, { id })
}

/** The domains one gateway's Cloudflare account could add. */
export async function gatewayAvailableDomains(id: string): Promise<AvailableDomain[]> {
  return invoke<AvailableDomain[]>(COMMANDS.gatewayAvailableDomains, { id })
}

/**
 * Adds a domain at one gateway: by that account's catch-all, or through a relay in another account. Adds a workspace
 * for it when a name is given. Rejects with the gateway's reason.
 */
export async function addGatewayDomain(id: string, domain: string, via: GatewayDomain['via'], workspaceName: string | null): Promise<GatewayDomain> {
  return invoke<GatewayDomain>(COMMANDS.addGatewayDomain, { id, domain, via, workspaceName })
}

/** Removes a domain at one gateway, which restores its old catch-all when it had one. */
export async function removeGatewayDomain(id: string, domain: string): Promise<void> {
  await invoke(COMMANDS.removeGatewayDomain, { id, domain })
}

/** Every connected sender, without keys. */
export async function listSenders(): Promise<Sender[]> {
  return isTauri() ? invoke<Sender[]>(COMMANDS.listSenders) : preview.senders()
}

/** Connects a Resend key. `domains` is only needed for a sending-only key. Rejects with Resend's reason. */
export async function addResendSender(name: string, key: string, domains: string[]): Promise<Sender[]> {
  return isTauri() ? invoke<Sender[]>(COMMANDS.addResendSender, { name, key, domains }) : preview.addSender(name, key, domains)
}

/** Asks Resend again for every key's domains. */
export async function refreshSenders(): Promise<Sender[]> {
  return isTauri() ? invoke<Sender[]>(COMMANDS.refreshSenders) : preview.senders()
}

/** Changes a sender's signature, or a sending-only key's domains. */
export async function updateSender(id: string, change: { signature?: string; domains?: string[] }): Promise<Sender[]> {
  return isTauri() ? invoke<Sender[]>(COMMANDS.updateSender, { id, signature: change.signature ?? null, domains: change.domains ?? null }) : preview.updateSender(id, change)
}

/** Forgets a sender. */
export async function removeSender(id: string): Promise<Sender[]> {
  return isTauri() ? invoke<Sender[]>(COMMANDS.removeSender, { id }) : preview.removeSender(id)
}

/** The domains mail can be sent from now. */
export async function sendableDomains(): Promise<Sendable[]> {
  return isTauri() ? invoke<Sendable[]>(COMMANDS.sendableDomains) : preview.sendable()
}

/** Sends a draft. Resolves to the copy kept in Sent; rejects with a `SendFailure`. */
export async function sendMessage(draft: Draft): Promise<Message> {
  return isTauri() ? invoke<Message>(COMMANDS.sendMessage, { draft }) : preview.send(draft)
}

/** People to suggest as recipients. */
export async function suggestContacts(query: string): Promise<Contact[]> {
  return isTauri() ? invoke<Contact[]>(COMMANDS.suggestContacts, { query }) : preview.contacts(query)
}

/** Every message in a conversation outside the trash, oldest first. */
export async function threadMessages(threadId: string): Promise<Message[]> {
  return isTauri() ? invoke<Message[]>(COMMANDS.threadMessages, { threadId }) : preview.thread(threadId)
}

/** Searches every folder's subjects, people and text. */
export async function searchAll(query: string): Promise<Message[]> {
  return isTauri() ? invoke<Message[]>(COMMANDS.searchAll, { query }) : preview.searchAll(query)
}

/** Snoozes messages until `until`, or wakes them now with null. Resolves to how many changed. */
export async function snoozeMessages(ids: string[], until: Date | null): Promise<number> {
  const seconds = until === null ? null : Math.floor(until.getTime() / 1000)
  return isTauri() ? invoke<number>(COMMANDS.snoozeMessages, { ids, until: seconds }) : preview.change(ids, { snoozedUntil: until === null ? null : until.toISOString() }).length
}

/** Everyone the mailbox knows whose name or address holds `query`, most messages first. */
export async function listContacts(query: string): Promise<KnownContact[]> {
  return isTauri() ? invoke<KnownContact[]>(COMMANDS.listContacts, { query }) : preview.knownContacts(query)
}
