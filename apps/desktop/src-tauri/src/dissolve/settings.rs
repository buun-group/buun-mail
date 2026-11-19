//! The dissolve.email account, saved as `dissolve.json` in the config folder, readable by this user only: the
//! server, the client id, the tokens, and which messages of which inbox are already here.

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::paths::write_private;

const FILE: &str = "dissolve.json";

/// The public server. Another can be set for a self-hosted or local one.
pub const DEFAULT_SERVER: &str = "https://api.dissolve.email";

/// The account and what has been collected from it.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DissolveSettings {
    /// The API and OAuth server; [`DEFAULT_SERVER`] when empty.
    pub server: String,
    /// The OAuth client id: a registered one, or the one this app registered for itself.
    pub client_id: String,
    /// The signed-in account, while connected.
    pub account: Option<Account>,
    /// Keep an inbox's mail here after it ends on dissolve.email. Off by default: mail goes when its inbox does.
    pub keep_after_expiry: bool,
    /// Every inbox seen, by its id.
    pub inboxes: BTreeMap<String, KnownInbox>,
}

/// A signed-in account and its tokens.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    /// The account's email, when shared.
    pub email: Option<String>,
    /// Its plan when last checked.
    pub plan: String,
    /// The access token.
    pub access_token: String,
    /// The refresh token.
    pub refresh_token: String,
    /// When the access token ends, Unix seconds.
    pub expires_at: i64,
}

/// An inbox, and the messages of it already stored here.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct KnownInbox {
    /// Its address, which is also its folder's name.
    pub address: String,
    /// The name the person gave it.
    pub custom_name: Option<String>,
    /// When it ends, RFC 3339.
    pub expires_at: String,
    /// True once it ended on dissolve.email while its mail was kept here.
    pub ended: bool,
    /// Its extensions, as dissolve.email last reported them.
    pub extensions: Option<Extensions>,
    /// Remote message id to the id stored here.
    pub messages: BTreeMap<String, String>,
}

impl DissolveSettings {
    /// The server to call.
    #[must_use]
    pub fn server(&self) -> &str {
        if self.server.trim().is_empty() { DEFAULT_SERVER } else { self.server.trim_end_matches('/') }
    }
}

/// The saved settings, or none yet.
#[must_use]
pub fn load(config_folder: &Path) -> DissolveSettings {
    fs::read_to_string(config_folder.join(FILE)).ok().and_then(|text| serde_json::from_str(&text).ok()).unwrap_or_default()
}

/// Saves the settings so only this user can read them.
///
/// # Errors
///
/// [`AppError::File`] when the file cannot be written.
pub fn save(config_folder: &Path, settings: &DissolveSettings) -> Result<(), AppError> {
    write_private(&config_folder.join(FILE), &serde_json::to_string_pretty(settings).unwrap_or_default())
}

/// An inbox's extensions, as dissolve.email last reported them.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Extensions {
    /// Extensions used.
    pub used: Option<i64>,
    /// Extensions allowed; `None` for unlimited or not reported.
    pub limit: Option<i64>,
    /// Whether it can be extended again.
    pub can_extend: Option<bool>,
    /// When it can next be extended, RFC 3339.
    pub available_at: Option<String>,
}
