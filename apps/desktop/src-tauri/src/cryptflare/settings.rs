//! The `CryptFlare` connection, saved as `cryptflare.json` in the config folder, readable by this user only: the
//! servers, the client id, the sealed tokens, where saves go, and the saves still waiting. Every secret value in it
//! (tokens, client id, a waiting save's value) is sealed with the install's key.

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::paths::write_private;

const FILE: &str = "cryptflare.json";

/// `CryptFlare`'s authorization server, which also issues tokens for the REST API.
pub const DEFAULT_ISSUER: &str = "https://mcp.cryptflare.com";

/// `CryptFlare`'s REST API, the audience the app's tokens are for (RFC 8707). Calls go to `{api}/v1/...`.
pub const DEFAULT_API: &str = "https://api.cryptflare.com";

/// The connection, where saves go, and what is waiting.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CryptFlareSettings {
    /// The authorization server; [`DEFAULT_ISSUER`] when empty.
    pub issuer: String,
    /// The REST API; [`DEFAULT_API`] when empty.
    pub api: String,
    /// The OAuth client id, sealed.
    #[serde(with = "crate::vault::sealed")]
    pub client_id: String,
    /// The redirect the client was registered with.
    pub client_redirect: String,
    /// The connected organisation and its tokens.
    pub account: Option<Account>,
    /// The workspace and environment saves go to.
    pub target: Option<Target>,
    /// Save each new or changed dissolve.email agent identity automatically.
    pub save_identities: bool,
    /// Saves not yet written, by secret key. A newer save of the same key replaces an older one.
    pub pending: BTreeMap<String, Pending>,
    /// The metadata last written for each key, so marking one ended keeps the rest of it.
    pub written: BTreeMap<String, BTreeMap<String, String>>,
    /// When the last save went through, RFC 3339.
    pub last_saved: Option<String>,
}

impl CryptFlareSettings {
    /// The authorization server to use.
    #[must_use]
    pub fn issuer(&self) -> &str {
        if self.issuer.trim().is_empty() { DEFAULT_ISSUER } else { self.issuer.trim_end_matches('/') }
    }

    /// The REST API to use, without `/v1`.
    #[must_use]
    pub fn api(&self) -> &str {
        if self.api.trim().is_empty() { DEFAULT_API } else { self.api.trim_end_matches('/') }
    }
}

/// The organisation the person connected, and its tokens.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    /// The organisation's id.
    pub org_id: String,
    /// Its name.
    pub org_name: String,
    /// The scopes granted, space separated.
    pub scope: String,
    /// The access token.
    #[serde(with = "crate::vault::sealed")]
    pub access_token: String,
    /// The refresh token; works once, replaced on every refresh.
    #[serde(with = "crate::vault::sealed")]
    pub refresh_token: String,
    /// When the access token ends, Unix seconds.
    pub expires_at: i64,
}

/// A workspace and environment.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Target {
    /// The workspace's id.
    pub workspace_id: String,
    /// Its name.
    pub workspace_name: String,
    /// The environment's id.
    pub environment_id: String,
    /// Its name.
    pub environment_name: String,
}

/// A save not yet written.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Pending {
    /// The value to write, sealed; empty when only the metadata changes.
    #[serde(with = "crate::vault::sealed")]
    pub value: String,
    /// Words the person reads beside it in `CryptFlare`.
    pub description: Option<String>,
    /// Where it came from. Never anything private: `CryptFlare` keeps metadata unencrypted.
    pub metadata: BTreeMap<String, String>,
    /// Tries so far.
    pub attempts: u32,
    /// Not before this, Unix seconds.
    pub next_at: i64,
    /// Why the last try failed.
    pub problem: Option<String>,
}

/// The saved settings, or none yet.
#[must_use]
pub fn load(config_folder: &Path) -> CryptFlareSettings {
    fs::read_to_string(config_folder.join(FILE)).ok().and_then(|text| serde_json::from_str(&text).ok()).unwrap_or_default()
}

/// Saves the settings so only this user can read them.
///
/// # Errors
///
/// [`AppError::File`] when the file cannot be written.
pub fn save(config_folder: &Path, settings: &CryptFlareSettings) -> Result<(), AppError> {
    write_private(&config_folder.join(FILE), &serde_json::to_string_pretty(settings).unwrap_or_default())
}
