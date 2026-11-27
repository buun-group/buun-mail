//! The `CryptFlare` REST calls this app makes: who the token is for, the workspaces and environments it may reach,
//! and writing a secret (create, a new version, its description and metadata). Never reading a value back.

use std::collections::BTreeMap;
use std::time::Duration;

use serde::Deserialize;
use serde_json::{Value, json};
use thiserror::Error;
use ureq::Agent;

const TIMEOUT: Duration = Duration::from_secs(30);

/// How long to wait after a `429` that names no wait, in seconds.
const DEFAULT_RETRY_AFTER: i64 = 60;

/// Why a call failed.
#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum CfError {
    /// Not connected.
    #[error("CryptFlare is not connected")]
    NotConnected,
    /// The token was refused: refresh once, then reconnect.
    #[error("CryptFlare refused the sign-in; connect again")]
    Unauthorized,
    /// A scope or workspace the grant does not cover. Never retried.
    #[error("{0}")]
    Forbidden(String),
    /// The secret already exists.
    #[error("the secret already exists")]
    Conflict,
    /// The secret, workspace or environment is not there.
    #[error("{0}")]
    NotFound(String),
    /// Too many requests: wait this many seconds.
    #[error("CryptFlare is busy; trying again in {0} seconds")]
    Limited(i64),
    /// The server could not be reached or failed.
    #[error("CryptFlare could not be reached: {0}")]
    Unreachable(String),
    /// Refused for another reason, in the server's words.
    #[error("{0}")]
    Refused(String),
}

/// A workspace or environment.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct Named {
    /// Its id.
    pub id: String,
    /// Its name.
    #[serde(default)]
    pub name: String,
}

#[derive(Deserialize)]
struct List {
    #[serde(default)]
    data: Vec<Named>,
}

/// Who a token is for.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Whoami {
    /// The organisation's id.
    pub org_id: String,
    /// The organisation.
    #[serde(default)]
    pub organisation: Option<Organisation>,
}

/// An organisation's name.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct Organisation {
    /// Its name.
    #[serde(default)]
    pub name: String,
}

/// Where a secret goes: the organisation, workspace and environment.
#[derive(Debug, Clone, Copy)]
pub struct Place<'a> {
    /// The organisation's id.
    pub org: &'a str,
    /// The workspace's id.
    pub workspace: &'a str,
    /// The environment's id.
    pub environment: &'a str,
}

/// One secret to write.
#[derive(Debug, Clone, Copy)]
pub struct Write<'a> {
    /// `UPPER_SNAKE_CASE`.
    pub key: &'a str,
    /// The value.
    pub value: &'a str,
    /// Words the person reads.
    pub description: Option<&'a str>,
    /// Where it came from.
    pub metadata: &'a BTreeMap<String, String>,
}

/// The REST API at `base` with a bearer token.
pub struct Api {
    agent: Agent,
    base: String,
    bearer: String,
}

/// Percent-encodes a path segment.
fn segment(value: &str) -> String {
    value
        .bytes()
        .map(|byte| if byte.is_ascii_alphanumeric() || b"-._~".contains(&byte) { char::from(byte).to_string() } else { format!("%{byte:02X}") })
        .collect()
}

/// The words in an error answer: RFC 9457 `detail`, or `message`, `title`, `error`.
fn words_of(body: &Value, status: u16) -> String {
    let error = &body["error"];
    [&body["detail"], &body["message"], &error["message"], &body["title"], error]
        .iter()
        .find_map(|value| value.as_str().map(str::to_owned))
        .unwrap_or_else(|| format!("CryptFlare answered HTTP {status}"))
}

impl Api {
    /// The API at `base` (without `/v1`) for `token`.
    #[must_use]
    pub fn new(base: &str, token: &str) -> Self {
        Self {
            agent: Agent::config_builder().timeout_global(Some(TIMEOUT)).http_status_as_error(false).build().new_agent(),
            base: format!("{}/v1", base.trim_end_matches('/')),
            bearer: format!("Bearer {token}"),
        }
    }

    fn secrets(&self, place: Place<'_>) -> String {
        format!(
            "{}/organisations/{}/workspaces/{}/environments/{}/secrets",
            self.base,
            segment(place.org),
            segment(place.workspace),
            segment(place.environment)
        )
    }

    /// Sends a request and reads a JSON answer, turning a refusal into a [`CfError`].
    fn send(&self, method: &str, url: &str, body: Option<&Value>) -> Result<Value, CfError> {
        let request = ureq::http::Request::builder().method(method).uri(url).header("Authorization", &self.bearer).header("Accept", "application/json");
        let outcome = match body {
            Some(body) => {
                let request =
                    request.header("Content-Type", "application/json").body(body.to_string()).map_err(|error| CfError::Unreachable(error.to_string()))?;
                self.agent.run(request)
            }
            None => self.agent.run(request.body(()).map_err(|error| CfError::Unreachable(error.to_string()))?),
        };
        let mut response = outcome.map_err(|error| CfError::Unreachable(error.to_string()))?;
        let status = response.status().as_u16();
        let retry_after = response.headers().get("Retry-After").and_then(|value| value.to_str().ok()).and_then(|value| value.trim().parse::<i64>().ok());
        let text = response.body_mut().read_to_string().unwrap_or_default();
        let value: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
        match status {
            200..=299 => Ok(value),
            401 => Err(CfError::Unauthorized),
            403 => Err(CfError::Forbidden(words_of(&value, status))),
            404 => Err(CfError::NotFound(words_of(&value, status))),
            409 => Err(CfError::Conflict),
            429 => Err(CfError::Limited(retry_after.unwrap_or(DEFAULT_RETRY_AFTER))),
            500..=599 => Err(CfError::Unreachable(words_of(&value, status))),
            _ => Err(CfError::Refused(words_of(&value, status))),
        }
    }

    /// Who the token is for.
    ///
    /// # Errors
    ///
    /// [`CfError`] when the call fails.
    pub fn whoami(&self) -> Result<Whoami, CfError> {
        serde_json::from_value(self.send("GET", &format!("{}/auth/whoami", self.base), None)?).map_err(|error| CfError::Unreachable(error.to_string()))
    }

    /// The workspaces the grant allows.
    ///
    /// # Errors
    ///
    /// [`CfError`] when the call fails.
    pub fn workspaces(&self, org: &str) -> Result<Vec<Named>, CfError> {
        let value = self.send("GET", &format!("{}/organisations/{}/workspaces", self.base, segment(org)), None)?;
        Ok(serde_json::from_value::<List>(value).map_err(|error| CfError::Unreachable(error.to_string()))?.data)
    }

    /// A workspace's environments.
    ///
    /// # Errors
    ///
    /// [`CfError`] when the call fails.
    pub fn environments(&self, org: &str, workspace: &str) -> Result<Vec<Named>, CfError> {
        let value = self.send("GET", &format!("{}/organisations/{}/workspaces/{}/environments", self.base, segment(org), segment(workspace)), None)?;
        Ok(serde_json::from_value::<List>(value).map_err(|error| CfError::Unreachable(error.to_string()))?.data)
    }

    /// Creates a secret.
    ///
    /// # Errors
    ///
    /// [`CfError::Conflict`] when the key exists, or as for any call.
    pub fn create(&self, place: Place<'_>, write: Write<'_>) -> Result<(), CfError> {
        let body = json!({ "key": write.key, "value": write.value, "description": write.description, "metadata": write.metadata });
        self.send("POST", &self.secrets(place), Some(&body)).map(drop)
    }

    /// Writes a new version of an existing secret.
    ///
    /// # Errors
    ///
    /// [`CfError`] when the call fails.
    pub fn rotate(&self, place: Place<'_>, key: &str, value: &str) -> Result<(), CfError> {
        self.send("POST", &format!("{}/{}/rotate", self.secrets(place), segment(key)), Some(&json!({ "value": value }))).map(drop)
    }

    /// Sets a secret's description and metadata, without a new version.
    ///
    /// # Errors
    ///
    /// [`CfError`] when the call fails.
    pub fn settle(&self, place: Place<'_>, key: &str, description: Option<&str>, metadata: &BTreeMap<String, String>) -> Result<(), CfError> {
        let body = json!({ "description": description, "metadata": metadata });
        self.send("PATCH", &format!("{}/{}/settings", self.secrets(place), segment(key)), Some(&body)).map(drop)
    }
}
