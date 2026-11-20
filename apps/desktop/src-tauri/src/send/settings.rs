//! The services this app sends through, saved as `senders.json` in the config folder, readable by this user only.

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::paths::write_private;

/// The settings file's name in the config folder.
const FILE: &str = "senders.json";

/// Which service a sender is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SenderKind {
    /// Resend, through its HTTP API.
    Resend,
    /// A mail server, over SMTP.
    Smtp,
}

/// A domain a sender may send from, and whether its owner has finished verifying it there.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SenderDomain {
    /// The domain, lowercased.
    pub name: String,
    /// The service's word for its state: `verified`, `pending`, `failed` and so on, or `entered` when the person typed
    /// it in for a key that cannot list domains.
    pub status: String,
}

impl SenderDomain {
    /// True when mail can be sent from it: verified at the service, or entered by hand for a sending-only key.
    #[must_use]
    pub fn sendable(&self) -> bool {
        self.status == "verified" || self.status == "entered"
    }
}

/// One connected sender.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SenderSettings {
    /// A stable id, made when it is connected.
    pub id: String,
    /// What the person calls it.
    pub name: String,
    /// Which service it is.
    pub kind: SenderKind,
    /// The secret: Resend's API key, or the mail server's password. Never sent to the UI.
    #[serde(with = "crate::vault::sealed")]
    pub api_key: String,
    /// The mail server, for an SMTP sender.
    #[serde(default)]
    pub smtp: Option<super::smtp::SmtpServer>,
    /// True when its domains were entered by hand: a sending-only Resend key, or a mail server.
    pub restricted: bool,
    /// The domains it may send from.
    pub domains: Vec<SenderDomain>,
    /// The signature added under new messages and replies sent through it.
    #[serde(default)]
    pub signature: String,
}

/// Every saved sender, oldest first.
#[must_use]
pub fn load(config_folder: &Path) -> Vec<SenderSettings> {
    fs::read_to_string(config_folder.join(FILE)).ok().and_then(|text| serde_json::from_str(&text).ok()).unwrap_or_default()
}

/// Saves every sender so only this user can read them.
///
/// # Errors
///
/// [`AppError::File`] when the file cannot be written.
pub fn save(config_folder: &Path, senders: &[SenderSettings]) -> Result<(), AppError> {
    // Settings are plain strings, so serialising cannot fail.
    write_private(&config_folder.join(FILE), &serde_json::to_string_pretty(senders).unwrap_or_default())
}
