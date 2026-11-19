//! The `/v1` calls this app makes, with an OAuth access token. Blocking and small, run off the window's thread.

use std::time::Duration;

use serde::Deserialize;
use serde_json::{Map, Value, json};
use thiserror::Error;
use ureq::Agent;

const TIMEOUT: Duration = Duration::from_secs(30);

/// The largest message source taken.
const SOURCE_LIMIT: u64 = 30 * 1024 * 1024;

/// Why a call failed, in words for Settings and toasts.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum ApiError {
    /// The access token was refused: refresh it, or connect again.
    #[error("dissolve.email no longer accepts this sign-in; connect again in Settings, Integrations")]
    Unauthorized,
    /// Too many calls; wait before the next.
    #[error("dissolve.email asked to slow down; trying again in a minute")]
    Slow,
    /// The thing asked about is gone, such as an inbox that expired.
    #[error("it is no longer on dissolve.email")]
    Gone,
    /// The server could not be reached or answered something unexpected.
    #[error("dissolve.email could not be reached: {0}")]
    Unreachable(String),
    /// No account is connected.
    #[error("dissolve.email is not connected")]
    NotConnected,
    /// The server refused, in its own words, such as a plan limit.
    #[error("{0}")]
    Refused(String),
}

/// The signed-in account.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Me {
    /// The account id.
    pub id: String,
    /// Its email, with the `email` scope.
    pub email: Option<String>,
    /// `free`, `pro`, `business` and so on.
    pub plan: String,
}

/// One inbox.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteInbox {
    /// Its id.
    pub id: String,
    /// Its address.
    pub address: String,
    /// The name the person gave it.
    #[serde(default)]
    pub custom_name: Option<String>,
    /// When it ends, RFC 3339.
    pub expires_at: String,
}

/// One message as listed.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteMessage {
    /// Its id.
    pub id: String,
    /// The sender's address.
    #[serde(default)]
    pub from_address: String,
    /// The sender's name.
    #[serde(default)]
    pub from_name: Option<String>,
    /// The subject.
    #[serde(default)]
    pub subject: Option<String>,
    /// The text body, when the list carries it.
    #[serde(default)]
    pub body_text: Option<String>,
    /// The HTML body, when the list carries it.
    #[serde(default)]
    pub body_html: Option<String>,
    /// When it arrived, RFC 3339.
    pub received_at: String,
}

#[derive(Deserialize)]
struct Refusal {
    message: Option<String>,
    error: Option<String>,
}

/// A client for one server and access token.
pub struct Api {
    base: String,
    bearer: String,
    agent: Agent,
}

impl Api {
    /// A client for the API at `base`, such as `https://api.dissolve.email`.
    #[must_use]
    pub fn new(base: &str, access_token: &str) -> Self {
        let agent = Agent::config_builder().timeout_global(Some(TIMEOUT)).http_status_as_error(false).build().new_agent();
        Self { base: base.trim_end_matches('/').to_owned(), bearer: format!("Bearer {}", access_token.trim()), agent }
    }

    fn url(&self, path: &str) -> String {
        format!("{}/v1{path}", self.base)
    }

    fn get(&self, path: &str) -> Result<ureq::http::Response<ureq::Body>, ApiError> {
        checked(self.agent.get(self.url(path)).header("Authorization", &self.bearer).call())
    }

    /// The signed-in account.
    ///
    /// # Errors
    ///
    /// [`ApiError`] when the call fails.
    pub fn me(&self) -> Result<Me, ApiError> {
        self.get("/me")?.body_mut().read_json().map_err(unexpected)
    }

    /// The account's live inboxes, newest first.
    ///
    /// # Errors
    ///
    /// [`ApiError`] when the call fails.
    pub fn inboxes(&self) -> Result<Vec<RemoteInbox>, ApiError> {
        self.get("/inboxes")?.body_mut().read_json().map_err(unexpected)
    }

    /// One inbox's messages.
    ///
    /// # Errors
    ///
    /// [`ApiError::Gone`] when the inbox ended, or as for [`Api::me`].
    pub fn messages(&self, inbox: &str) -> Result<Vec<RemoteMessage>, ApiError> {
        let mut response = self.get(&format!("/inboxes/{}/messages", segment(inbox)))?;
        let value: Value = response.body_mut().read_json().map_err(unexpected)?;
        // A bare list today; a `{ messages }` envelope is read too, should the shape grow.
        let list = match value {
            Value::Object(mut object) => object.remove("messages").unwrap_or(Value::Array(Vec::new())),
            other => other,
        };
        serde_json::from_value(list).map_err(unexpected)
    }

    /// A message's original bytes, or `None` when the server did not keep them (mail stored before it did).
    ///
    /// # Errors
    ///
    /// As for [`Api::messages`].
    pub fn source(&self, inbox: &str, message: &str) -> Result<Option<Vec<u8>>, ApiError> {
        match self.get(&format!("/inboxes/{}/messages/{}/eml", segment(inbox), segment(message))) {
            Ok(mut response) => response.body_mut().with_config().limit(SOURCE_LIMIT).read_to_vec().map(Some).map_err(unexpected),
            Err(ApiError::Gone) => Ok(None),
            Err(other) => Err(other),
        }
    }

    /// Makes an inbox, on `domain` or the default one, with an optional name.
    ///
    /// # Errors
    ///
    /// [`ApiError::Refused`] at a plan limit, or as for [`Api::me`].
    pub fn create_inbox(&self, domain: Option<&str>, custom_name: Option<&str>) -> Result<RemoteInbox, ApiError> {
        let mut body = Map::new();
        if let Some(domain) = domain.filter(|value| !value.trim().is_empty()) {
            body.insert("domain".to_owned(), json!(domain.trim()));
        }
        if let Some(name) = custom_name.filter(|value| !value.trim().is_empty()) {
            body.insert("customName".to_owned(), json!(name.trim()));
        }
        checked(self.agent.post(self.url("/inboxes")).header("Authorization", &self.bearer).send_json(Value::Object(body)))?
            .body_mut()
            .read_json()
            .map_err(unexpected)
    }

    /// Gives an inbox more time. Returns it with its new end.
    ///
    /// # Errors
    ///
    /// [`ApiError::Refused`] when the plan allows no more, or too early, in the server's words.
    pub fn extend(&self, inbox: &str) -> Result<RemoteInbox, ApiError> {
        checked(self.agent.post(self.url(&format!("/inboxes/{}/extend", segment(inbox)))).header("Authorization", &self.bearer).send_empty())?
            .body_mut()
            .read_json()
            .map_err(unexpected)
    }

    /// Ends an inbox now, and its mail on the server with it.
    ///
    /// # Errors
    ///
    /// As for [`Api::me`]; an inbox already gone counts as done.
    pub fn delete_inbox(&self, inbox: &str) -> Result<(), ApiError> {
        match checked(self.agent.delete(self.url(&format!("/inboxes/{}", segment(inbox)))).header("Authorization", &self.bearer).call()) {
            Ok(_) | Err(ApiError::Gone) => Ok(()),
            Err(other) => Err(other),
        }
    }
}

/// An id safe in a path: anything but letters, digits, `-` and `_` is dropped, so an id can never reach another route.
fn segment(id: &str) -> String {
    id.chars().filter(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_')).collect()
}

#[allow(clippy::needless_pass_by_value, reason = "passed to map_err, which hands the error over")]
fn unexpected<E: ToString>(error: E) -> ApiError {
    ApiError::Unreachable(error.to_string())
}

/// The response when it succeeded, otherwise what went wrong.
fn checked(response: Result<ureq::http::Response<ureq::Body>, ureq::Error>) -> Result<ureq::http::Response<ureq::Body>, ApiError> {
    let mut response = response.map_err(unexpected)?;
    let status = response.status().as_u16();
    match status {
        200..=299 => Ok(response),
        401 => Err(ApiError::Unauthorized),
        404 | 410 => Err(ApiError::Gone),
        _ => {
            let refusal = response.body_mut().read_json::<Refusal>().ok();
            // Too early to extend is a refusal worth reading; any other 429 means slow down.
            if status == 429 && refusal.as_ref().and_then(|refusal| refusal.error.as_deref()) != Some("EXTEND_TOO_EARLY") {
                return Err(ApiError::Slow);
            }
            Err(ApiError::Refused(
                refusal.and_then(|refusal| refusal.message.or(refusal.error)).unwrap_or_else(|| format!("dissolve.email answered HTTP {status}")),
            ))
        }
    }
}
