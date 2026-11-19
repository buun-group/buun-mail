//! The commands the UI calls. Each is a thin call into the [`Mailbox`]; logic lives there and in the crates. Every
//! change made here is logged as made by you.

#![allow(clippy::needless_pass_by_value, reason = "Tauri hands state and arguments to commands by value")]

use std::path::PathBuf;
use std::sync::Arc;

use buun_mail_rules::Rule;
use buun_mail_store::Placement;
use tauri::{AppHandle, State};

use crate::agent::{AgentState, AgentStatusDto};
use crate::dissolve::{DissolveInboxDto, DissolveService, DissolveStatusDto};
use crate::dto::{ActivityDto, ContactDto, ImportReportDto, KnownContactDto, MessageDetailDto, MessageDto, ShelfDto, TagCountDto, ViewDto, WorkspaceDto};
use crate::error::AppError;
use crate::events;
use crate::imap::{ImapAccountDto, ImapSecurity, ImapService};
use crate::mailbox::{Actor, AttachmentDataDto, ExportFormat, Mailbox};
use crate::send::{DraftDto, Security, SendFailure, SendService, SendableDto, SenderDto, SmtpServer};
use crate::sync::{AvailableZone, CheckReportDto, DomainRoute, GatewayStatusDto, OwnedDomain, SyncService};

/// Every workspace for the sidebar.
#[tauri::command]
pub fn list_workspaces(mailbox: State<'_, Arc<Mailbox>>) -> Result<Vec<WorkspaceDto>, AppError> {
    mailbox.workspaces()
}

/// The messages in one folder. `folder` of `None` is the inbox.
#[tauri::command]
pub fn list_messages(mailbox: State<'_, Arc<Mailbox>>, workspace: String, folder: Option<String>) -> Result<Vec<MessageDto>, AppError> {
    mailbox.messages(&Placement { workspace, folder })
}

/// A list across every workspace: starred, archive or trash.
#[tauri::command]
pub fn list_view(mailbox: State<'_, Arc<Mailbox>>, view: ViewDto) -> Result<Vec<MessageDto>, AppError> {
    mailbox.view(view.into())
}

/// Marks messages read or unread.
#[tauri::command]
pub fn set_messages_unread(mailbox: State<'_, Arc<Mailbox>>, ids: Vec<String>, unread: bool) -> Result<Vec<MessageDto>, AppError> {
    mailbox.set_unread(&ids, unread, &Actor::You)
}

/// Stars or unstars messages.
#[tauri::command]
pub fn set_messages_starred(mailbox: State<'_, Arc<Mailbox>>, ids: Vec<String>, starred: bool) -> Result<Vec<MessageDto>, AppError> {
    mailbox.set_starred(&ids, starred, &Actor::You)
}

/// Archives, trashes or puts back messages.
#[tauri::command]
pub fn shelve_messages(mailbox: State<'_, Arc<Mailbox>>, ids: Vec<String>, shelf: ShelfDto) -> Result<usize, AppError> {
    mailbox.shelve(&ids, shelf.into(), &Actor::You)
}

/// Deletes messages for good.
#[tauri::command]
pub fn delete_messages_forever(mailbox: State<'_, Arc<Mailbox>>, ids: Vec<String>) -> Result<usize, AppError> {
    mailbox.delete_forever(&ids, &Actor::You)
}

/// Empties the trash.
#[tauri::command]
pub fn empty_trash(mailbox: State<'_, Arc<Mailbox>>) -> Result<usize, AppError> {
    mailbox.empty_trash(false, &Actor::You)
}

/// Writes messages to the file the person chose, as `.eml`, `.mbox`, JSON, CSV or text.
#[tauri::command]
pub fn export_messages(mailbox: State<'_, Arc<Mailbox>>, ids: Vec<String>, format: ExportFormat, path: PathBuf) -> Result<usize, AppError> {
    mailbox.export(&ids, format, &path)
}

/// Saves one attachment to the file the person chose. Returns its name.
#[tauri::command]
pub fn save_attachment(mailbox: State<'_, Arc<Mailbox>>, id: String, index: usize, path: PathBuf) -> Result<String, AppError> {
    mailbox.save_attachment(&id, index, &path)
}

/// Moves a message to another folder or workspace.
#[tauri::command]
pub fn move_message(mailbox: State<'_, Arc<Mailbox>>, id: String, workspace: String, folder: Option<String>) -> Result<MessageDto, AppError> {
    mailbox.move_message(&id, &Placement { workspace, folder }, &Actor::You)
}

/// Opens one message: its text, and it is marked read.
#[tauri::command]
pub fn open_message(mailbox: State<'_, Arc<Mailbox>>, id: String) -> Result<MessageDetailDto, AppError> {
    mailbox.open_message(&id)
}

/// Marks a folder read, or the whole workspace with `wholeWorkspace`.
#[tauri::command]
pub fn mark_all_read(mailbox: State<'_, Arc<Mailbox>>, workspace: String, folder: Option<String>, whole_workspace: bool) -> Result<usize, AppError> {
    mailbox.mark_all_read(&Placement { workspace, folder }, whole_workspace, &Actor::You)
}

/// Adds tags to a message.
#[tauri::command]
pub fn tag_message(mailbox: State<'_, Arc<Mailbox>>, id: String, tags: Vec<String>) -> Result<MessageDto, AppError> {
    mailbox.tag(&id, &tags, &Actor::You)
}

/// Removes a tag from a message.
#[tauri::command]
pub fn untag_message(mailbox: State<'_, Arc<Mailbox>>, id: String, tag: String) -> Result<MessageDto, AppError> {
    mailbox.untag(&id, &tag, &Actor::You)
}

/// Every tag in use.
#[tauri::command]
pub fn list_tags(mailbox: State<'_, Arc<Mailbox>>) -> Result<Vec<TagCountDto>, AppError> {
    mailbox.tags()
}

/// Every rule, in run order.
#[tauri::command]
pub fn list_rules(mailbox: State<'_, Arc<Mailbox>>) -> Result<Vec<Rule>, AppError> {
    mailbox.rules()
}

/// Adds or replaces a rule.
#[tauri::command]
pub fn save_rule(mailbox: State<'_, Arc<Mailbox>>, rule: Rule) -> Result<Rule, AppError> {
    mailbox.save_rule(rule, &Actor::You)
}

/// Deletes a rule.
#[tauri::command]
pub fn delete_rule(mailbox: State<'_, Arc<Mailbox>>, id: String) -> Result<bool, AppError> {
    mailbox.delete_rule(&id, &Actor::You)
}

/// Runs every rule over the mail already stored.
#[tauri::command]
pub fn apply_rules(mailbox: State<'_, Arc<Mailbox>>) -> Result<usize, AppError> {
    mailbox.apply_rules_to_stored(&Actor::You)
}

/// The latest changes by people, rules and agents.
#[tauri::command]
pub fn list_activity(mailbox: State<'_, Arc<Mailbox>>, limit: usize) -> Result<Vec<ActivityDto>, AppError> {
    mailbox.activity(limit)
}

/// Imports `.eml` and `.mbox` files the person picked, and announces what arrived.
#[tauri::command]
pub fn import_files(app: AppHandle, mailbox: State<'_, Arc<Mailbox>>, paths: Vec<PathBuf>) -> Result<ImportReportDto, AppError> {
    let (report, arrived) = mailbox.import_files(&paths)?;
    events::mail_arrived(&app, &arrived);
    Ok(report)
}

/// Where the routing file lives.
#[tauri::command]
pub fn routing_path(mailbox: State<'_, Arc<Mailbox>>) -> String {
    mailbox.routing_path().display().to_string()
}

/// Agent access: on or off, running or not, the URL and the token.
#[tauri::command]
pub fn agent_status(agent: State<'_, AgentState>) -> Result<AgentStatusDto, AppError> {
    agent.status()
}

/// Turns agent access on or off.
#[tauri::command]
pub fn set_agent_enabled(agent: State<'_, AgentState>, enabled: bool) -> Result<AgentStatusDto, AppError> {
    agent.set_enabled(enabled)
}

/// Makes a new token, cutting off every agent that used the old one.
#[tauri::command]
pub fn regenerate_agent_token(agent: State<'_, AgentState>) -> Result<AgentStatusDto, AppError> {
    agent.regenerate_token()
}

/// Every connected mail gateway and how its checks are going.
#[tauri::command]
pub fn list_gateways(sync: State<'_, SyncService>) -> Result<Vec<GatewayStatusDto>, AppError> {
    sync.list()
}

/// Checks and saves a mail gateway under a name, then starts collecting from it.
#[tauri::command]
pub fn add_gateway(sync: State<'_, SyncService>, name: String, url: String, token: String) -> Result<Vec<GatewayStatusDto>, String> {
    sync.add(&name, &url, &token)
}

/// Forgets one mail gateway.
#[tauri::command]
pub fn remove_gateway(sync: State<'_, SyncService>, id: String) -> Result<Vec<GatewayStatusDto>, AppError> {
    sync.remove(&id)
}

/// Checks every mail gateway now, away from the window's thread, and reports what arrived.
#[tauri::command]
pub async fn check_gateways(sync: State<'_, SyncService>) -> Result<CheckReportDto, AppError> {
    let check = sync.check_now_handle();
    tauri::async_runtime::spawn_blocking(move || check.run()).await.map_err(|_| AppError::Poisoned)?
}

/// The domains one gateway receives for.
#[tauri::command]
pub fn gateway_domains(sync: State<'_, SyncService>, id: String) -> Result<Vec<OwnedDomain>, String> {
    sync.domains(&id)
}

/// The domains in one gateway's Cloudflare account that could be added.
#[tauri::command]
pub fn gateway_available_domains(sync: State<'_, SyncService>, id: String) -> Result<Vec<AvailableZone>, String> {
    sync.available_domains(&id)
}

/// Adds a domain at one gateway, by catch-all or through a relay, and when asked, a workspace for it.
#[tauri::command]
pub fn add_gateway_domain(
    sync: State<'_, SyncService>,
    mailbox: State<'_, Arc<Mailbox>>,
    id: String,
    domain: String,
    via: DomainRoute,
    workspace_name: Option<String>,
) -> Result<OwnedDomain, String> {
    let added = sync.add_domain(&id, &domain, via)?;
    if let Some(name) = workspace_name.filter(|name| !name.trim().is_empty()) {
        mailbox.ensure_workspace_for(&added.domain, name.trim(), &Actor::You).map_err(|error| error.to_string())?;
    }
    Ok(added)
}

/// Removes a domain at one gateway. The workspace stays.
#[tauri::command]
pub fn remove_gateway_domain(sync: State<'_, SyncService>, id: String, domain: String) -> Result<(), String> {
    sync.remove_domain(&id, &domain)
}

/// Every connected sender, without its key.
#[tauri::command]
pub fn list_senders(send: State<'_, SendService>) -> Result<Vec<SenderDto>, AppError> {
    send.list()
}

/// Connects a Resend key, away from the window's thread: its domains come with it, or are entered for a sending-only key.
#[tauri::command]
pub async fn add_resend_sender(send: State<'_, SendService>, name: String, key: String, domains: Vec<String>) -> Result<Vec<SenderDto>, String> {
    let send = send.inner().clone();
    tauri::async_runtime::spawn_blocking(move || send.add_resend(&name, &key, &domains)).await.map_err(|error| error.to_string())?
}

/// Asks Resend again for each key's domains.
#[tauri::command]
pub async fn refresh_senders(send: State<'_, SendService>) -> Result<Vec<SenderDto>, String> {
    let send = send.inner().clone();
    tauri::async_runtime::spawn_blocking(move || send.refresh()).await.map_err(|error| error.to_string())?
}

/// Changes a sender's signature, or a sending-only key's domains.
#[tauri::command]
pub fn update_sender(send: State<'_, SendService>, id: String, signature: Option<String>, domains: Option<Vec<String>>) -> Result<Vec<SenderDto>, AppError> {
    send.update(&id, signature, domains)
}

/// Forgets a sender.
#[tauri::command]
pub fn remove_sender(send: State<'_, SendService>, id: String) -> Result<Vec<SenderDto>, AppError> {
    send.remove(&id)
}

/// The domains mail can be sent from now, each with its signature.
#[tauri::command]
pub fn sendable_domains(send: State<'_, SendService>) -> Result<Vec<SendableDto>, AppError> {
    send.sendable()
}

/// Sends a draft away from the window's thread, keeps a copy in Sent, and announces the change.
#[tauri::command]
pub async fn send_message(app: AppHandle, send: State<'_, SendService>, draft: DraftDto) -> Result<MessageDto, SendFailure> {
    let service = send.inner().clone();
    let delivered =
        tauri::async_runtime::spawn_blocking(move || service.send(&draft)).await.map_err(|error| SendFailure { retry: true, message: error.to_string() })??;
    events::mail_changed(&app);
    Ok(delivered)
}

/// People to suggest as recipients.
#[tauri::command]
pub fn suggest_contacts(mailbox: State<'_, Arc<Mailbox>>, query: String) -> Result<Vec<ContactDto>, AppError> {
    mailbox.contacts(&query)
}

/// Every message in a conversation outside the trash, oldest first.
#[tauri::command]
pub fn thread_messages(mailbox: State<'_, Arc<Mailbox>>, thread_id: String) -> Result<Vec<MessageDto>, AppError> {
    mailbox.thread(&thread_id)
}

/// Searches every folder's subjects, people and text.
#[tauri::command]
pub fn search_all(mailbox: State<'_, Arc<Mailbox>>, query: String) -> Result<Vec<MessageDto>, AppError> {
    mailbox.search_all(&query)
}

/// Snoozes messages until `until` (Unix seconds), or wakes them now with none.
#[tauri::command]
pub fn snooze_messages(mailbox: State<'_, Arc<Mailbox>>, ids: Vec<String>, until: Option<i64>) -> Result<usize, AppError> {
    mailbox.snooze(&ids, until, &Actor::You)
}

/// Everyone the mailbox knows, for the contacts page.
#[tauri::command]
pub fn list_contacts(mailbox: State<'_, Arc<Mailbox>>, query: String) -> Result<Vec<KnownContactDto>, AppError> {
    mailbox.all_contacts(&query)
}

/// One attachment's bytes for a preview inside the app.
#[tauri::command]
pub fn attachment_data(mailbox: State<'_, Arc<Mailbox>>, id: String, index: usize) -> Result<AttachmentDataDto, AppError> {
    mailbox.attachment_data(&id, index)
}

/// Opens one attachment with the system's own app for its kind; programs and scripts are refused.
#[tauri::command]
pub fn open_attachment(app: AppHandle, mailbox: State<'_, Arc<Mailbox>>, id: String, index: usize) -> Result<(), AppError> {
    use tauri_plugin_opener::OpenerExt as _;
    let path = mailbox.attachment_to_open(&id, index)?;
    app.opener().open_path(path.display().to_string(), None::<&str>).map_err(|error| AppError::Unreadable(error.to_string()))
}

/// Each picked file's name and size, for the compose window's attachment list.
#[tauri::command]
pub fn describe_files(paths: Vec<PathBuf>) -> Vec<(String, String, u64)> {
    paths
        .iter()
        .filter_map(|path| {
            let size = std::fs::metadata(path).ok()?.len();
            let name = path.file_name()?.to_string_lossy().into_owned();
            Some((path.display().to_string(), name, size))
        })
        .collect()
}

/// Connects a mail server for sending, away from the window's thread: its sign-in is checked first.
#[tauri::command]
#[allow(clippy::too_many_arguments, reason = "each is one field of the form, named as the UI sends it")]
pub async fn add_smtp_sender(
    send: State<'_, SendService>,
    name: String,
    host: String,
    port: u16,
    security: Security,
    username: String,
    password: String,
    domains: Vec<String>,
) -> Result<Vec<SenderDto>, String> {
    let service = send.inner().clone();
    let server = SmtpServer { host: host.trim().to_owned(), port, security, username };
    tauri::async_runtime::spawn_blocking(move || service.add_smtp(&name, server, &password, &domains)).await.map_err(|error| error.to_string())?
}

/// Every IMAP mailbox, without passwords, with how its checks are going.
#[tauri::command]
pub fn list_imap_accounts(imap: State<'_, ImapService>) -> Result<Vec<ImapAccountDto>, AppError> {
    imap.list()
}

/// Adds an IMAP mailbox after signing in to check it, then collects its newest messages, away from the window's thread.
#[tauri::command]
#[allow(clippy::too_many_arguments, reason = "each is one field of the form, named as the UI sends it")]
pub async fn add_imap_account(
    imap: State<'_, ImapService>,
    name: String,
    host: String,
    port: u16,
    security: ImapSecurity,
    username: String,
    password: String,
    folder: String,
) -> Result<Vec<ImapAccountDto>, String> {
    let service = imap.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.add(&name, &host, port, security, &username, &password, &folder))
        .await
        .map_err(|error| error.to_string())?
}

/// Forgets an IMAP mailbox.
#[tauri::command]
pub fn remove_imap_account(imap: State<'_, ImapService>, id: String) -> Result<Vec<ImapAccountDto>, AppError> {
    imap.remove(&id)
}

/// Checks every IMAP mailbox now, away from the window's thread. Returns how many messages arrived.
#[tauri::command]
pub async fn check_imap_accounts(imap: State<'_, ImapService>) -> Result<usize, String> {
    let service = imap.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.check_all()).await.map_err(|error| error.to_string())
}

/// The dissolve.email connection and its inboxes, never a token.
#[tauri::command]
pub fn dissolve_status(dissolve: State<'_, DissolveService>) -> Result<DissolveStatusDto, AppError> {
    dissolve.status()
}

/// Signs in to dissolve.email in the browser, away from the window's thread, waiting up to five minutes.
#[tauri::command]
pub async fn connect_dissolve(dissolve: State<'_, DissolveService>, server: Option<String>) -> Result<DissolveStatusDto, String> {
    let service = dissolve.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.connect(server.as_deref())).await.map_err(|error| error.to_string())?
}

/// Signs out of dissolve.email; with `delete_mail`, its mail here goes too.
#[tauri::command]
pub async fn disconnect_dissolve(dissolve: State<'_, DissolveService>, delete_mail: bool) -> Result<DissolveStatusDto, String> {
    let service = dissolve.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.disconnect(delete_mail).map_err(|error| error.to_string())).await.map_err(|error| error.to_string())?
}

/// Checks dissolve.email now. Returns how many messages arrived.
#[tauri::command]
pub async fn check_dissolve(dissolve: State<'_, DissolveService>) -> Result<usize, String> {
    let service = dissolve.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.check()).await.map_err(|error| error.to_string())?
}

/// Keeps an inbox's mail after it ends on dissolve.email, or not.
#[tauri::command]
pub fn set_dissolve_keep(dissolve: State<'_, DissolveService>, keep: bool) -> Result<DissolveStatusDto, AppError> {
    dissolve.set_keep_after_expiry(keep)
}

/// Makes a dissolve.email inbox.
#[tauri::command]
pub async fn create_dissolve_inbox(dissolve: State<'_, DissolveService>, domain: Option<String>, name: Option<String>) -> Result<DissolveInboxDto, String> {
    let service = dissolve.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.create_inbox(domain.as_deref(), name.as_deref())).await.map_err(|error| error.to_string())?
}

/// Gives a dissolve.email inbox more time.
#[tauri::command]
pub async fn extend_dissolve_inbox(dissolve: State<'_, DissolveService>, id: String) -> Result<DissolveStatusDto, String> {
    let service = dissolve.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.extend_inbox(&id)).await.map_err(|error| error.to_string())?
}

/// Burns a dissolve.email inbox: ended there, its mail deleted here.
#[tauri::command]
pub async fn burn_dissolve_inbox(dissolve: State<'_, DissolveService>, id: String) -> Result<DissolveStatusDto, String> {
    let service = dissolve.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.burn_inbox(&id)).await.map_err(|error| error.to_string())?
}
