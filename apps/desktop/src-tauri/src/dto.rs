//! The shapes the UI receives. Kept apart from the domain so a field can be renamed on one side without the other.
//! `apps/desktop/ui/src/api/types.ts` mirrors these; change both together.

use serde::Serialize;

/// One workspace in the sidebar.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDto {
    /// The stable id.
    pub id: String,
    /// The name shown.
    pub name: String,
    /// The addresses it owns, as written: `*@acme.com`.
    pub addresses: Vec<String>,
    /// Its folders, inbox first.
    pub folders: Vec<FolderDto>,
    /// Unread messages across every folder.
    pub unread: usize,
}

/// One folder in a workspace. The inbox has no name.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FolderDto {
    /// The folder name, `None` for the inbox.
    pub name: Option<String>,
    /// Unread messages in it.
    pub unread: usize,
}

/// One message in the list.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MessageDto {
    /// A stable id.
    pub id: String,
    /// The workspace the router placed it in.
    pub workspace: String,
    /// The folder, `None` for the inbox.
    pub folder: Option<String>,
    /// The sender's display name.
    pub from_name: String,
    /// The sender's address.
    pub from: String,
    /// The address that received it: what the router read.
    pub to: String,
    /// The recipient rule that chose the workspace, `None` for unsorted mail.
    pub matched: Option<String>,
    /// The sender rule that chose the folder, `None` for the inbox.
    pub folder_matched: Option<String>,
    /// The subject line.
    pub subject: String,
    /// The first lines of the body.
    pub preview: String,
    /// When it arrived, RFC 3339 in UTC.
    pub received_at: String,
    /// True until read.
    pub unread: bool,
}
