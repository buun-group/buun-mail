//! The commands the UI calls. Each is a thin call into the [`Mailbox`]; logic lives there and in the crates. Every
//! change made here is logged as made by you.

#![allow(clippy::needless_pass_by_value, reason = "Tauri hands state and arguments to commands by value")]

use std::path::PathBuf;
use std::sync::Arc;

use buun_mail_rules::Rule;
use buun_mail_store::Placement;
use tauri::{AppHandle, State};

use crate::agent::{AgentState, AgentStatusDto};
use crate::dto::{ActivityDto, ImportReportDto, MessageDetailDto, MessageDto, TagCountDto, WorkspaceDto};
use crate::error::AppError;
use crate::events;
use crate::mailbox::{Actor, Mailbox};
use crate::sync::{GatewayStatusDto, SyncService};

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

/// The mail gateway connection's status.
#[tauri::command]
pub fn gateway_status(sync: State<'_, SyncService>) -> Result<GatewayStatusDto, AppError> {
    sync.status()
}

/// Checks and saves a mail gateway address and token, then starts collecting.
#[tauri::command]
pub fn connect_gateway(sync: State<'_, SyncService>, url: String, token: String) -> Result<GatewayStatusDto, String> {
    sync.connect(&url, &token)
}

/// Forgets the mail gateway.
#[tauri::command]
pub fn disconnect_gateway(sync: State<'_, SyncService>) -> Result<GatewayStatusDto, AppError> {
    sync.disconnect()
}

/// Checks the mail gateway now.
#[tauri::command]
pub fn check_gateway(sync: State<'_, SyncService>) {
    sync.check_now();
}
