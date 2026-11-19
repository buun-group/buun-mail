//! The shapes the UI receives. Kept apart from the domain so either side can change a field name on its own.
//! `apps/desktop/ui/src/api/types.ts` mirrors these; change both together.

use buun_mail_message::rfc3339;
use buun_mail_store::{Activity, MessageRecord, Shelf, View};
use serde::{Deserialize, Serialize};

/// One workspace in the sidebar.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDto {
    /// The stable id.
    pub id: String,
    /// The name shown.
    pub name: String,
    /// The glyph key from the routing file, `None` for the initial.
    pub icon: Option<String>,
    /// The addresses it owns, as written: `*@acme.com`.
    pub addresses: Vec<String>,
    /// Its folders, inbox first.
    pub folders: Vec<FolderDto>,
    /// Unread messages across every folder.
    pub unread: u32,
}

/// One folder in a workspace. The inbox has no name.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FolderDto {
    /// The folder name, `None` for the inbox.
    pub name: Option<String>,
    /// The glyph key from the routing file, `None` for the default folder glyph.
    pub icon: Option<String>,
    /// Unread messages in it.
    pub unread: u32,
}

/// One message in the list.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MessageDto {
    /// The content id.
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
    /// When it was sent, RFC 3339 in UTC.
    pub received_at: String,
    /// True until read.
    pub unread: bool,
    /// Starred.
    pub starred: bool,
    /// In its folder, archived or in the trash.
    pub shelf: ShelfDto,
    /// Tags, sorted.
    pub tags: Vec<String>,
}

/// Where a message sits: in its folder, archived, or in the trash. Sent and received as `active`, `archived`, `trashed`.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ShelfDto {
    /// In its folder.
    Active,
    /// Archived.
    Archived,
    /// In the trash.
    Trashed,
}

impl From<Shelf> for ShelfDto {
    fn from(shelf: Shelf) -> Self {
        match shelf {
            Shelf::Active => Self::Active,
            Shelf::Archived => Self::Archived,
            Shelf::Trashed => Self::Trashed,
        }
    }
}

impl From<ShelfDto> for Shelf {
    fn from(shelf: ShelfDto) -> Self {
        match shelf {
            ShelfDto::Active => Self::Active,
            ShelfDto::Archived => Self::Archived,
            ShelfDto::Trashed => Self::Trashed,
        }
    }
}

/// A list across every workspace, as the UI names it.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ViewDto {
    /// Starred messages.
    Starred,
    /// Archived messages.
    Archive,
    /// The trash.
    Trash,
}

impl From<ViewDto> for View {
    fn from(view: ViewDto) -> Self {
        match view {
            ViewDto::Starred => Self::Starred,
            ViewDto::Archive => Self::Archived,
            ViewDto::Trash => Self::Trashed,
        }
    }
}

impl From<MessageRecord> for MessageDto {
    fn from(record: MessageRecord) -> Self {
        Self {
            id: record.id,
            workspace: record.placement.workspace,
            folder: record.placement.folder,
            from_name: record.from_name,
            from: record.from,
            to: record.to,
            matched: record.matched,
            folder_matched: record.folder_matched,
            subject: record.subject,
            preview: record.preview,
            received_at: rfc3339(record.sent_at),
            unread: record.unread,
            starred: record.starred,
            shelf: record.shelf.into(),
            tags: record.tags,
        }
    }
}

/// An open message: its summary and its readable text.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MessageDetailDto {
    /// The summary, as the list shows it.
    pub message: MessageDto,
    /// The plain text body, or the HTML body as text.
    pub body: String,
}

/// What an import did, for the report under the import button.
#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportReportDto {
    /// New messages stored.
    pub added: u32,
    /// Messages already in the store, skipped.
    pub duplicates: u32,
    /// Messages or files that could not be taken in, each with why.
    pub failed: Vec<ImportFailureDto>,
}

/// One thing an import could not take in.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportFailureDto {
    /// The file, and the message's place in it when the file is an mbox.
    pub source: String,
    /// Why, in words for a person.
    pub reason: String,
}

/// A tag and how many messages carry it.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TagCountDto {
    /// The tag.
    pub tag: String,
    /// How many messages carry it.
    pub count: u32,
}

/// One change in the activity log.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ActivityDto {
    /// When, RFC 3339 in UTC.
    pub at: String,
    /// Who: `you`, `rule:<name>` or `agent:<name>`.
    pub actor: String,
    /// What: `tag`, `move`, `mark_read`, `save_rule` and so on.
    pub action: String,
    /// The details, in words.
    pub detail: String,
}

impl From<Activity> for ActivityDto {
    fn from(entry: Activity) -> Self {
        Self { at: rfc3339(entry.at), actor: entry.actor, action: entry.action, detail: entry.detail }
    }
}
