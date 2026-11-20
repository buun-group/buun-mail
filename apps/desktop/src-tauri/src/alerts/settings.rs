//! The alert channels, saved as `alerts.json` in the config folder, readable by this user only, secrets sealed.

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::paths::write_private;

const FILE: &str = "alerts.json";

/// Where an alert goes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AlertKind {
    /// A Slack incoming webhook.
    Slack,
    /// A Discord webhook.
    Discord,
    /// An ntfy topic, on ntfy.sh or your own server: a push to your phone.
    Ntfy,
    /// A Telegram bot, to one chat.
    Telegram,
    /// Any address that takes a JSON POST.
    Webhook,
    /// An email, sent through one of your connected senders.
    Email,
    /// A text message through Twilio.
    Sms,
}

/// One channel.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlertChannel {
    /// A stable id, which rules name.
    pub id: String,
    /// What the person calls it, such as `GunSpec sales in Slack`.
    pub name: String,
    /// Which kind.
    pub kind: AlertKind,
    /// The parts that are not secret: an ntfy server, a Telegram chat, a phone number, an address.
    #[serde(default)]
    pub fields: BTreeMap<String, String>,
    /// The secret: a webhook address, a topic, a bot or auth token. Sealed at rest; empty for an email channel.
    #[serde(default, with = "crate::vault::sealed")]
    pub secret: String,
    /// The local day (`2026-11-20`) its last daily digest went, so a restart never sends a second one.
    #[serde(default)]
    pub last_digest: Option<String>,
}

impl AlertChannel {
    /// A non-secret field, or empty.
    #[must_use]
    pub fn field(&self, name: &str) -> &str {
        self.fields.get(name).map_or("", |value| value.trim())
    }
}

/// Every saved channel.
#[must_use]
pub fn load(config_folder: &Path) -> Vec<AlertChannel> {
    fs::read_to_string(config_folder.join(FILE)).ok().and_then(|text| serde_json::from_str(&text).ok()).unwrap_or_default()
}

/// Saves every channel so only this user can read them, secrets sealed.
///
/// # Errors
///
/// [`AppError::File`] when the file cannot be written.
pub fn save(config_folder: &Path, channels: &[AlertChannel]) -> Result<(), AppError> {
    write_private(&config_folder.join(FILE), &serde_json::to_string_pretty(channels).unwrap_or_default())
}
