import { invoke, isTauri } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { openUrl } from '@tauri-apps/plugin-opener'

import type { ExportFormat } from '../constants/ui'
import { COMMANDS, IMPORT_EXTENSIONS } from './commands'
import { preview, previewDetail, previewMessages, previewView, previewWorkspaces } from './preview'
import type { Activity, AgentStatus, AlertChannel, Profile, Template, Writing, Reminder, ScheduledMessage, AlertKind, AvailableDomain, CheckReport, Contact, RevealStatus, SecretKind, DissolveInbox, DissolveStatus, Draft, FileToSend, ImapAccount, KnownContact, SmtpSecurity, SmtpServer, Sendable, Sender, GatewayDomain, GatewayStatus, ImportReport, MailView, Message, MessageDetail, Place, Rule, Shelf, TagCount, Workspace } from './types'

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

/** One attachment's bytes for a preview, as base64 with its type. */
export async function attachmentData(id: string, index: number): Promise<{ name: string; mime: string; base64: string }> {
  if (isTauri()) return invoke(COMMANDS.attachmentData, { id, index })
  return { name: 'INV-2026-11.pdf', mime: 'text/plain', base64: btoa('Invoice INV-2026-11\nAmount: $120.00\nDue: 1 December') }
}

/** Opens one attachment with the system's own app. Rejects for a program or script. */
export async function openAttachment(id: string, index: number): Promise<void> {
  if (isTauri()) await invoke(COMMANDS.openAttachment, { id, index })
}

/** Asks for files to attach and describes them. Resolves to none when cancelled or in a plain browser. */
export async function pickFilesToSend(): Promise<FileToSend[]> {
  if (!isTauri()) return []
  const picked = await open({ multiple: true, directory: false })
  if (picked === null || picked.length === 0) return []
  const described = await invoke<[string, string, number][]>(COMMANDS.describeFiles, { paths: picked })
  return described.map(([path, name, size]) => ({ name, size, path }))
}

/** Connects a mail server for sending, after checking its sign-in. Rejects with the server's reason. */
export async function addSmtpSender(name: string, server: SmtpServer, password: string, domains: string[]): Promise<Sender[]> {
  return isTauri() ? invoke<Sender[]>(COMMANDS.addSmtpSender, { name, ...server, password, domains }) : preview.addSmtp(name, server, domains)
}

/** Every IMAP mailbox collected from. */
export async function listImapAccounts(): Promise<ImapAccount[]> {
  return isTauri() ? invoke<ImapAccount[]>(COMMANDS.listImapAccounts) : preview.imapAccounts()
}

/** Adds an IMAP mailbox after checking its sign-in, and collects its newest mail. Rejects with the server's reason. */
export async function addImapAccount(account: { name: string; host: string; port: number; security: SmtpSecurity; username: string; password: string; folder: string }): Promise<ImapAccount[]> {
  return isTauri() ? invoke<ImapAccount[]>(COMMANDS.addImapAccount, account) : preview.addImap(account)
}

/** Forgets an IMAP mailbox. */
export async function removeImapAccount(id: string): Promise<ImapAccount[]> {
  return isTauri() ? invoke<ImapAccount[]>(COMMANDS.removeImapAccount, { id }) : preview.removeImap(id)
}

/** Checks every IMAP mailbox now. Resolves to how many messages arrived. */
export async function checkImapAccounts(): Promise<number> {
  return isTauri() ? invoke<number>(COMMANDS.checkImapAccounts) : 0
}

/** The dissolve.email connection and its inboxes. */
export async function dissolveStatus(): Promise<DissolveStatus> {
  return isTauri() ? invoke<DissolveStatus>(COMMANDS.dissolveStatus) : preview.dissolve.status()
}

/** Signs in to dissolve.email in the browser; resolves once the browser comes back (up to five minutes). */
export async function connectDissolve(server?: string): Promise<DissolveStatus> {
  return isTauri() ? invoke<DissolveStatus>(COMMANDS.connectDissolve, { server: server ?? null }) : preview.dissolve.connect()
}

/** Signs out of dissolve.email; with `deleteMail`, its mail here goes too. */
export async function disconnectDissolve(deleteMail: boolean): Promise<DissolveStatus> {
  return isTauri() ? invoke<DissolveStatus>(COMMANDS.disconnectDissolve, { deleteMail }) : preview.dissolve.disconnect(deleteMail)
}

/** Checks dissolve.email now. Resolves to how many messages arrived. */
export async function checkDissolve(): Promise<number> {
  return isTauri() ? invoke<number>(COMMANDS.checkDissolve) : 0
}

/** Keeps an inbox's mail after it ends on dissolve.email, or not. */
export async function setDissolveKeep(keep: boolean): Promise<DissolveStatus> {
  return isTauri() ? invoke<DissolveStatus>(COMMANDS.setDissolveKeep, { keep }) : preview.dissolve.keep(keep)
}

/** Makes a dissolve.email inbox, on a domain or the account's default, with an optional name. */
export async function createDissolveInbox(options: { domain?: string; name?: string } = {}): Promise<DissolveInbox> {
  return isTauri() ? invoke<DissolveInbox>(COMMANDS.createDissolveInbox, { domain: options.domain ?? null, name: options.name ?? null }) : preview.dissolve.create(options.name, options.domain)
}

/** The domains a new dissolve.email inbox can be made on, the default first. */
export async function dissolveDomains(): Promise<string[]> {
  return isTauri() ? invoke<string[]>(COMMANDS.dissolveDomains) : ['dissolve.email', 'minutes.email']
}

/** Gives a dissolve.email inbox more time. Rejects with dissolve.email's reason, such as too early. */
export async function extendDissolveInbox(id: string): Promise<DissolveStatus> {
  return isTauri() ? invoke<DissolveStatus>(COMMANDS.extendDissolveInbox, { id }) : preview.dissolve.extend(id)
}

/** Burns a dissolve.email inbox: ended there, its mail deleted here. */
export async function burnDissolveInbox(id: string): Promise<DissolveStatus> {
  return isTauri() ? invoke<DissolveStatus>(COMMANDS.burnDissolveInbox, { id }) : preview.dissolve.burn(id)
}

/** Whether a reveal code is set, and how long reveals stay open. */
export async function revealStatus(): Promise<RevealStatus> {
  return isTauri() ? invoke<RevealStatus>(COMMANDS.revealStatus) : preview.security.status()
}

/** Sets, changes or removes the reveal code (`code` null removes it); changing or removing needs the current one. */
export async function setRevealCode(current: string | null, code: string | null): Promise<RevealStatus> {
  return isTauri() ? invoke<RevealStatus>(COMMANDS.setRevealCode, { current, code }) : preview.security.set(current, code)
}

/** Closes reveals now. */
export async function lockReveals(): Promise<RevealStatus> {
  return isTauri() ? invoke<RevealStatus>(COMMANDS.lockReveals) : preview.security.lock()
}

/** A saved secret shown again. Rejects with the reason, such as the reveal code being needed or wrong. */
export async function revealSecret(kind: SecretKind, id: string, code: string | null): Promise<string> {
  return isTauri() ? invoke<string>(COMMANDS.revealSecret, { kind, id, code }) : preview.security.reveal(kind, id, code)
}

/** Every alert channel. */
export async function listAlerts(): Promise<AlertChannel[]> {
  return isTauri() ? invoke<AlertChannel[]>(COMMANDS.listAlerts) : preview.alerts.list()
}

/** Adds an alert channel. Rejects with what is missing. */
export async function addAlert(channel: { name: string; kind: AlertKind; fields: Record<string, string>; secret: string }): Promise<AlertChannel[]> {
  return isTauri() ? invoke<AlertChannel[]>(COMMANDS.addAlert, channel) : preview.alerts.add(channel)
}

/** Forgets an alert channel. */
export async function removeAlert(id: string): Promise<AlertChannel[]> {
  return isTauri() ? invoke<AlertChannel[]>(COMMANDS.removeAlert, { id }) : preview.alerts.remove(id)
}

/** Sends a sample alert through a channel. */
export async function testAlert(id: string): Promise<void> {
  return isTauri() ? invoke<void>(COMMANDS.testAlert, { id }) : undefined
}

/** Unsubscribes from a message's list with one POST, when its list offers one-click unsubscribing. */
export async function unsubscribeOneClick(id: string): Promise<void> {
  return isTauri() ? invoke<void>(COMMANDS.unsubscribeOneClick, { id }) : undefined
}

/** Schedules a message to go at `at`, with a reminder after it when `remindDays` is given. */
export async function scheduleSend(draft: Draft, at: Date, remindDays: number | null): Promise<ScheduledMessage[]> {
  const sendAt = Math.floor(at.getTime() / 1000)
  return isTauri() ? invoke<ScheduledMessage[]>(COMMANDS.scheduleSend, { draft, sendAt, remindDays }) : preview.later.schedule(draft, at)
}

/** Every scheduled message, soonest first. */
export async function listScheduled(): Promise<ScheduledMessage[]> {
  return isTauri() ? invoke<ScheduledMessage[]>(COMMANDS.listScheduled) : preview.later.list()
}

/** Cancels a scheduled message. */
export async function cancelScheduled(id: string): Promise<ScheduledMessage[]> {
  return isTauri() ? invoke<ScheduledMessage[]>(COMMANDS.cancelScheduled, { id }) : preview.later.cancel(id)
}

/** Sends a scheduled message now. */
export async function sendScheduledNow(id: string): Promise<ScheduledMessage[]> {
  return isTauri() ? invoke<ScheduledMessage[]>(COMMANDS.sendScheduledNow, { id }) : preview.later.cancel(id)
}

/** Reminds you in `days` days if nobody answers a sent message. */
export async function remindIfNoReply(messageId: string, days: number): Promise<Reminder[]> {
  return isTauri() ? invoke<Reminder[]>(COMMANDS.remindIfNoReply, { messageId, days }) : preview.later.remind(messageId, days)
}

/** Every waiting reminder, soonest first. */
export async function listReminders(): Promise<Reminder[]> {
  return isTauri() ? invoke<Reminder[]>(COMMANDS.listReminders) : preview.later.reminders()
}

/** Drops a reminder. */
export async function cancelReminder(id: string): Promise<Reminder[]> {
  return isTauri() ? invoke<Reminder[]>(COMMANDS.cancelReminder, { id }) : preview.later.dropReminder(id)
}

/** Every template and workspace profile. */
export async function readWriting(): Promise<Writing> {
  return isTauri() ? invoke<Writing>(COMMANDS.readWriting) : preview.writing.read()
}

/** Adds (empty id) or replaces a template. */
export async function saveTemplate(template: Template): Promise<Writing> {
  return isTauri() ? invoke<Writing>(COMMANDS.saveTemplate, { template }) : preview.writing.saveTemplate(template)
}

/** Forgets a template. */
export async function deleteTemplate(id: string): Promise<Writing> {
  return isTauri() ? invoke<Writing>(COMMANDS.deleteTemplate, { id }) : preview.writing.deleteTemplate(id)
}

/** Sets a workspace's signature and address for new mail. */
export async function saveProfile(workspace: string, profile: Profile): Promise<Writing> {
  return isTauri() ? invoke<Writing>(COMMANDS.saveProfile, { workspace, profile }) : preview.writing.saveProfile(workspace, profile)
}

/** The private note on a message's conversation, or null. */
export async function messageNote(id: string): Promise<string | null> {
  return isTauri() ? invoke<string | null>(COMMANDS.messageNote, { id }) : preview.notes.get(id)
}

/** Keeps a private note on a message's conversation; an empty note is removed. */
export async function setMessageNote(id: string, text: string): Promise<void> {
  return isTauri() ? invoke<void>(COMMANDS.setMessageNote, { id, text }) : preview.notes.set(id, text)
}

/** Asks for a folder on this computer. Resolves to its path, or null when the person cancels. */
export async function pickFolder(): Promise<string | null> {
  if (!isTauri()) return null
  const picked = await open({ multiple: false, directory: true })
  return typeof picked === 'string' ? picked : null
}

/** Tells the app how far this computer's clock is from UTC, so digests go at local time. */
export async function setLocalOffset(): Promise<void> {
  if (isTauri()) await invoke<void>(COMMANDS.setLocalOffset, { minutes: -new Date().getTimezoneOffset() })
}

/** Sends a channel's daily digest now. */
export async function sendDigestNow(id: string): Promise<void> {
  return isTauri() ? invoke<void>(COMMANDS.sendDigestNow, { id }) : undefined
}
