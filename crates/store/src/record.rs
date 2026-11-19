//! What the store keeps for each message.

/// Where routing put a message: a workspace, and a folder in it (`None` for the inbox). Orders by workspace, then
/// inbox before folders.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Placement {
    /// The workspace id.
    pub workspace: String,
    /// The folder name, `None` for the inbox.
    pub folder: Option<String>,
}

/// One stored message: what the list shows, where it lives, and why it is there.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MessageRecord {
    /// The content id: the SHA-256 of the raw bytes.
    pub id: String,
    /// Where routing put it.
    pub placement: Placement,
    /// The recipient rule that chose the workspace, `None` for unsorted mail.
    pub matched: Option<String>,
    /// The sender rule that chose the folder, `None` for the inbox.
    pub folder_matched: Option<String>,
    /// The sender's display name.
    pub from_name: String,
    /// The sender's address.
    pub from: String,
    /// The address it was delivered to.
    pub to: String,
    /// The subject.
    pub subject: String,
    /// The first words of the body.
    pub preview: String,
    /// When it was sent, Unix seconds.
    pub sent_at: i64,
    /// The `Message-ID:` header, for threading later.
    pub message_id: Option<String>,
    /// True until read.
    pub unread: bool,
}

/// How many unread messages one folder holds.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UnreadCount {
    /// The folder.
    pub placement: Placement,
    /// Its unread messages.
    pub unread: u32,
}
