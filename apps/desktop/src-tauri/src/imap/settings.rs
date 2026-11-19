//! The IMAP mailboxes this app collects from, saved as `imap.json` in the config folder, readable by this user only.

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use super::client::ImapSecurity;
use crate::error::AppError;
use crate::paths::write_private;

/// The settings file's name in the config folder.
const FILE: &str = "imap.json";

/// One IMAP mailbox and how far it has been collected.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImapAccount {
    /// A stable id, made when it is added.
    pub id: String,
    /// What the person calls it.
    pub name: String,
    /// The server, such as `imap.gmail.com`.
    pub host: String,
    /// Its port.
    pub port: u16,
    /// How the connection is protected.
    pub security: ImapSecurity,
    /// The sign-in name, usually the full address.
    pub username: String,
    /// The password or app password. Never sent to the UI.
    pub password: String,
    /// The folder collected, usually `INBOX`.
    pub folder: String,
    /// The folder's UIDVALIDITY when last collected; numbers below mean nothing once it changes.
    #[serde(default)]
    pub uid_validity: u32,
    /// The highest message number collected so far.
    #[serde(default)]
    pub last_uid: u32,
}

/// Every saved mailbox, oldest first.
#[must_use]
pub fn load(config_folder: &Path) -> Vec<ImapAccount> {
    fs::read_to_string(config_folder.join(FILE)).ok().and_then(|text| serde_json::from_str(&text).ok()).unwrap_or_default()
}

/// Saves every mailbox so only this user can read them.
///
/// # Errors
///
/// [`AppError::File`] when the file cannot be written.
pub fn save(config_folder: &Path, accounts: &[ImapAccount]) -> Result<(), AppError> {
    // Settings are plain strings and numbers, so serialising cannot fail.
    write_private(&config_folder.join(FILE), &serde_json::to_string_pretty(accounts).unwrap_or_default())
}
