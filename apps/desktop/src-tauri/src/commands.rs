//! The commands the UI calls. Each is a thin read of the [`Mailbox`]; logic stays in the mailbox and the router.

use tauri::State;

use crate::dto::{MessageDto, WorkspaceDto};
use crate::mailbox::Mailbox;

/// Every workspace for the sidebar.
#[tauri::command]
#[allow(clippy::needless_pass_by_value, reason = "Tauri hands state over by value")]
pub fn list_workspaces(mailbox: State<'_, Mailbox>) -> Vec<WorkspaceDto> {
    mailbox.workspaces()
}

/// The messages in one folder. `folder` of `None` is the inbox.
#[tauri::command]
#[allow(clippy::needless_pass_by_value, reason = "Tauri hands state and arguments over by value")]
pub fn list_messages(mailbox: State<'_, Mailbox>, workspace: String, folder: Option<String>) -> Vec<MessageDto> {
    mailbox.messages(&workspace, folder.as_deref())
}
