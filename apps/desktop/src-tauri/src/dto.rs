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
    /// True for a workspace the routing file defines, which Settings can edit and delete. An integration's workspace,
    /// and mail left from a workspace that has gone, are not.
    pub editable: bool,
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
    /// Its conversation, once linked.
    pub thread_id: Option<String>,
    /// How many messages outside the trash share its conversation, itself included.
    pub thread_size: u32,
    /// When it comes back from a snooze, RFC 3339; `None` when not snoozed.
    pub snoozed_until: Option<String>,
    /// Tags, sorted.
    pub tags: Vec<String>,
    /// The raw message's size in bytes, once known.
    pub size: Option<i64>,
    /// The receiving server's sender checks, when the message carries them.
    pub checks: Option<AuthenticationDto>,
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
    /// Snoozed messages.
    Snoozed,
    /// Every workspace's mail together.
    All,
}

impl From<ViewDto> for View {
    fn from(view: ViewDto) -> Self {
        match view {
            ViewDto::Starred => Self::Starred,
            ViewDto::Archive => Self::Archived,
            ViewDto::Trash => Self::Trashed,
            ViewDto::Snoozed => Self::Snoozed,
            ViewDto::All => Self::All,
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
            thread_id: record.thread_id,
            thread_size: record.thread_size,
            snoozed_until: record.snoozed_until.map(rfc3339),
            tags: record.tags,
            size: record.size,
            checks: record.checks.as_deref().map(|summary| buun_mail_message::Authentication::from_summary(summary).into()),
        }
    }
}

impl MessageDto {
    /// A made-up message for Send a test, plainly a test.
    #[must_use]
    pub fn sample_for_alert() -> Self {
        Self {
            id: "test".to_owned(),
            workspace: "Buun Mail".to_owned(),
            folder: None,
            from_name: "Buun Mail".to_owned(),
            from: "test@buun-mail.invalid".to_owned(),
            to: "you".to_owned(),
            matched: None,
            folder_matched: None,
            subject: "This is a test alert".to_owned(),
            preview: "Alerts sent here look like this when a rule matches arriving mail.".to_owned(),
            received_at: crate::mailbox::rfc3339_now(),
            unread: true,
            starred: false,
            shelf: ShelfDto::Active,
            thread_id: None,
            thread_size: 1,
            snoozed_until: None,
            tags: Vec::new(),
            size: None,
            checks: None,
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
    /// Who it was written to, from its headers.
    pub recipients: RecipientsDto,
    /// Its HTML, inline images embedded, when it has an HTML part.
    pub html: Option<HtmlDto>,
    /// Its attachments, in order.
    pub attachments: Vec<AttachmentDto>,
    /// What the receiving server found when it checked the sender, when the message says.
    pub authentication: Option<AuthenticationDto>,
    /// How to leave the list it came from, when it says.
    pub unsubscribe: Option<UnsubscribeDto>,
}

/// How to leave a mailing list: a web address (one-click or a page) and an email address.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UnsubscribeDto {
    /// An https address.
    pub web: Option<String>,
    /// True when the app can unsubscribe for you with one POST, no page.
    pub one_click: bool,
    /// An address to email.
    pub mail_to: Option<String>,
    /// The subject that email should have.
    pub mail_subject: Option<String>,
    /// The body that email should have.
    pub mail_body: Option<String>,
}

impl From<buun_mail_message::Unsubscribe> for UnsubscribeDto {
    fn from(found: buun_mail_message::Unsubscribe) -> Self {
        Self {
            web: found.web,
            one_click: found.one_click,
            mail_to: found.mail.as_ref().map(|mail| mail.to.clone()),
            mail_subject: found.mail.as_ref().map(|mail| mail.subject.clone()),
            mail_body: found.mail.map(|mail| mail.body),
        }
    }
}

/// SPF, DKIM and DMARC as the receiving server found them, and the verdict, in plain words for the UI.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AuthenticationDto {
    /// `verified`, `failed` or `unclear`.
    pub verdict: &'static str,
    /// The server that checked.
    pub by: Option<String>,
    /// Each check: `pass`, `fail`, `other`, or absent.
    pub spf: Option<&'static str>,
    /// DKIM.
    pub dkim: Option<&'static str>,
    /// DMARC.
    pub dmarc: Option<&'static str>,
}

impl From<buun_mail_message::Authentication> for AuthenticationDto {
    fn from(found: buun_mail_message::Authentication) -> Self {
        use buun_mail_message::{Check, Verdict};
        let word = |check: Option<Check>| {
            check.map(|check| match check {
                Check::Pass => "pass",
                Check::Fail => "fail",
                Check::Other => "other",
            })
        };
        let verdict = match found.verdict() {
            Verdict::Verified => "verified",
            Verdict::Failed => "failed",
            Verdict::Unclear => "unclear",
        };
        Self { verdict, spf: word(found.spf), dkim: word(found.dkim), dmarc: word(found.dmarc), by: found.by }
    }
}

/// A message's HTML, ready for the reader's sealed frame.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HtmlDto {
    /// The HTML.
    pub html: String,
    /// How many remote images or styles it would fetch, all blocked until the person allows them.
    pub remote: usize,
}

/// One attachment, as the reader lists it.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentDto {
    /// Its position, for saving it.
    pub index: usize,
    /// Its file name.
    pub name: String,
    /// Its media type.
    pub mime: String,
    /// Its size in bytes.
    pub size: usize,
    /// True for a picture shown inside the HTML.
    pub inline: bool,
}

impl From<buun_mail_message::AttachmentInfo> for AttachmentDto {
    fn from(info: buun_mail_message::AttachmentInfo) -> Self {
        Self { index: info.index, name: info.name, mime: info.mime, size: info.size, inline: info.inline }
    }
}

/// One person on a message.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ContactDto {
    /// Their display name, when the header gives one.
    pub name: Option<String>,
    /// Their address.
    pub address: String,
}

/// Someone the mailbox knows, for the contacts page.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KnownContactDto {
    /// Their name, when any message gave one.
    pub name: Option<String>,
    /// Their address.
    pub address: String,
    /// How many messages from or to them.
    pub messages: u32,
    /// When the latest one was sent, RFC 3339.
    pub latest: String,
}

/// The To, Cc and Reply-To headers of an open message.
#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecipientsDto {
    /// The To header.
    pub to: Vec<ContactDto>,
    /// The Cc header.
    pub cc: Vec<ContactDto>,
    /// The Reply-To header.
    pub reply_to: Vec<ContactDto>,
}

impl From<buun_mail_message::Recipients> for RecipientsDto {
    fn from(found: buun_mail_message::Recipients) -> Self {
        let people =
            |list: Vec<buun_mail_message::Contact>| list.into_iter().map(|contact| ContactDto { name: contact.name, address: contact.address }).collect();
        Self { to: people(found.to), cc: people(found.cc), reply_to: people(found.reply_to) }
    }
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
