//! The `/v1` calls this app makes, with an OAuth access token. Blocking and small, run off the window's thread.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use thiserror::Error;
use ureq::Agent;

const TIMEOUT: Duration = Duration::from_secs(30);

/// The largest message source taken.
const SOURCE_LIMIT: u64 = 30 * 1024 * 1024;

/// How many changes one page of the feed asks for: dissolve.email's most.
const FEED_PAGE: u32 = 200;

/// A message from the changes feed: the inbox list's shape, with the inbox it is in.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FeedMessage {
    /// The inbox it arrived in.
    pub inbox_id: String,
    /// The message itself.
    #[serde(flatten)]
    pub message: RemoteMessage,
}

/// One page of the changes feed, oldest first.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Changes {
    /// New messages across every inbox the account reads.
    #[serde(default)]
    pub messages: Vec<FeedMessage>,
    /// Messages deleted and inboxes ended, across every inbox the account reads.
    #[serde(default)]
    pub removed: Vec<Removal>,
    /// Where the next page starts; on an empty page, the feed's head.
    pub next_cursor: String,
    /// More changes wait past this page.
    #[serde(default)]
    pub has_more: bool,
}

/// Something that left the feed's view: one message deleted, or a whole inbox expired or burned (no `message_id`).
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Removal {
    /// The inbox.
    pub inbox_id: String,
    /// The message, when one message was deleted.
    #[serde(default)]
    pub message_id: Option<String>,
}

/// What the changes feed answered.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Feed {
    /// A page of changes.
    Page(Changes),
    /// The cursor is older than the feed remembers (seven days) or not the server's: start again from the inboxes.
    Expired,
    /// The server has no changes feed (an older or self-hosted one): poll each inbox instead.
    Unsupported,
}

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
    /// A plan limit was reached, in the server's words, with the count it reported.
    #[error("{message}")]
    Limited {
        /// What the server said.
        message: String,
        /// The count, limit and reset it reported.
        meter: Meter,
    },
    /// The server refused, in its own words, such as a plan limit.
    #[error("{0}")]
    Refused(String),
}

/// A count against a limit. A negative limit means unlimited; `None` means not reported.
#[derive(Debug, Clone, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct Meter {
    /// How many are used.
    pub used: Option<i64>,
    /// How many the plan allows.
    pub limit: Option<i64>,
    /// When the count starts again, RFC 3339.
    pub reset_at: Option<String>,
}

/// What the plan allows, as `/v1/me` reports it. Fields the server does not send yet stay `None`.
#[derive(Debug, Clone, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct Limits {
    /// Live inboxes at once.
    pub max_inboxes: Option<i64>,
    /// How long a new inbox lasts.
    pub inbox_duration_minutes: Option<i64>,
    /// Whether the name before the @ can be chosen.
    pub custom_inbox_names: Option<bool>,
    /// API calls a minute for this sign-in.
    pub requests_per_minute: Option<i64>,
    /// New inboxes an hour; negative for unlimited.
    pub hourly_creations: Option<i64>,
    /// Extensions per inbox; negative for unlimited.
    pub max_extensions: Option<i64>,
    /// The longest an inbox can live, extensions included.
    pub max_total_lifetime_minutes: Option<i64>,
    /// Whether the plan includes agent identities (Pro and up).
    pub agent_identities: Option<bool>,
    /// Live agent identities at once.
    pub max_agent_identities: Option<i64>,
}

/// The sign-in this app holds, as `/v1/me` reports it.
#[derive(Debug, Clone, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct Connection {
    /// The scopes the person approved for this app.
    pub scopes: Vec<String>,
}

/// What has been used, when `/v1/me` reports it.
#[derive(Debug, Clone, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct Usage {
    /// New inboxes this hour.
    pub hourly_creations: Option<Meter>,
    /// API calls this minute.
    pub requests: Option<Meter>,
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
    /// What the plan allows.
    #[serde(default)]
    pub limits: Limits,
    /// What has been used.
    #[serde(default)]
    pub usage: Usage,
    /// The sign-in itself, when reported.
    #[serde(default)]
    pub connection: Option<Connection>,
}

/// A fictional person's postal address, made up like the rest of the persona.
#[derive(Debug, Clone, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct PersonaAddress {
    /// Number and street.
    pub street: String,
    /// The town or city.
    pub city: String,
    /// The region, state, province or county.
    pub state: String,
    /// The postcode or ZIP code.
    pub zip: String,
    /// The whole address on lines, as the country writes it.
    pub formatted: String,
}

/// A synthetic person to fill in a sign-up form with: every value is made up.
#[derive(Debug, Clone, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct Persona {
    /// The whole name.
    pub full_name: String,
    /// The given name.
    pub first_name: String,
    /// The family name.
    pub last_name: String,
    /// A username to match.
    pub username: String,
    /// YYYY-MM-DD.
    pub date_of_birth: String,
    /// Two letters, such as `GB`.
    pub country: String,
    /// The postal address.
    pub address: PersonaAddress,
    /// A number from the range kept for fiction, when the country has one.
    pub phone: Option<String>,
}

/// An agent identity: an inbox's address, a strong password and a persona, for one sign-up.
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteIdentity {
    /// Its id.
    pub id: String,
    /// The inbox's address, the identity's email.
    pub email: String,
    /// The password, or `None` when dissolve.email could not open it just now.
    #[serde(default)]
    pub password: Option<String>,
    /// The persona, when one was made.
    #[serde(default)]
    pub persona: Option<Persona>,
}

/// Why an inbox was made without the identity asked for.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct IdentitySkipped {
    /// `plan`, `limit`, `vault` or `anonymous`.
    #[serde(default)]
    pub reason: String,
    /// In dissolve.email's words.
    pub message: String,
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
    /// Extensions used, when reported.
    #[serde(default)]
    pub extension_count: Option<i64>,
    /// Extensions allowed, `None` for unlimited or not reported.
    #[serde(default)]
    pub max_extensions: Option<i64>,
    /// Whether it can be extended again, when reported.
    #[serde(default)]
    pub can_extend: Option<bool>,
    /// When it can next be extended, when reported.
    #[serde(default)]
    pub extend_available_at: Option<String>,
    /// Extensions left, `None` for unlimited or not reported.
    #[serde(default)]
    pub extends_left: Option<i64>,
    /// When it ends for good, extensions or not, RFC 3339; `None` for no ceiling or not reported.
    #[serde(default)]
    pub lifetime_ends_at: Option<String>,
    /// True once it has reached the plan's longest life, so no extension can add more.
    #[serde(default)]
    pub lifetime_reached: Option<bool>,
    /// The identity made with it, in the answer to making it.
    #[serde(default)]
    pub identity: Option<RemoteIdentity>,
    /// Why it was made without the identity asked for.
    #[serde(default)]
    pub identity_skipped: Option<IdentitySkipped>,
}

/// One inbox as `GET /inboxes/{id}` answers: just what this app reads of it.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct InboxDetail {
    /// The id of its identity, when it has one.
    identity_id: Option<String>,
    /// The identity in full, with the `identities:read` scope.
    identity: Option<RemoteIdentity>,
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

/// One domain inboxes can be made on.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteDomain {
    /// The domain.
    pub domain: String,
    /// True for the account's default.
    #[serde(default)]
    pub is_default: bool,
}

#[derive(Deserialize)]
struct Domains {
    domains: Vec<RemoteDomain>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct Refusal {
    message: Option<String>,
    error: Option<String>,
    limit: Option<i64>,
    used: Option<i64>,
    current: Option<i64>,
    reset_at: Option<String>,
    available_at: Option<String>,
}

/// A client for one server and access token.
pub struct Api {
    base: String,
    pub(super) bearer: String,
    pub(super) agent: Agent,
}

impl Api {
    /// A client for the API at `base`, such as `https://api.dissolve.email`.
    #[must_use]
    pub fn new(base: &str, access_token: &str) -> Self {
        let agent = Agent::config_builder().timeout_global(Some(TIMEOUT)).http_status_as_error(false).build().new_agent();
        Self { base: base.trim_end_matches('/').to_owned(), bearer: format!("Bearer {}", access_token.trim()), agent }
    }

    pub(super) fn url(&self, path: &str) -> String {
        format!("{}/v1{path}", self.base)
    }

    pub(super) fn get(&self, path: &str) -> Result<ureq::http::Response<ureq::Body>, ApiError> {
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

    /// The changes feed across every inbox: the page after `since`, or, with no cursor, the feed's head and no changes.
    /// One call covers every inbox, where [`Api::messages`] takes one call per inbox.
    ///
    /// # Errors
    ///
    /// As for [`Api::me`]; an expired cursor and a server without the feed are answers, not errors.
    pub fn changes(&self, since: Option<&str>) -> Result<Feed, ApiError> {
        let path = since.map_or_else(|| format!("/messages?limit={FEED_PAGE}"), |cursor| format!("/messages?limit={FEED_PAGE}&since={}", cursor_param(cursor)));
        let response = self.agent.get(self.url(&path)).header("Authorization", &self.bearer).call().map_err(unexpected)?;
        match response.status().as_u16() {
            404 => Ok(Feed::Unsupported),
            400 | 410 => Ok(Feed::Expired),
            _ => checked(Ok(response))?.body_mut().read_json().map(Feed::Page).map_err(unexpected),
        }
    }

    /// The domains inboxes can be made on, the default first.
    ///
    /// # Errors
    ///
    /// As for [`Api::me`].
    pub fn domains(&self) -> Result<Vec<String>, ApiError> {
        let mut found = self.get("/domains")?.body_mut().read_json::<Domains>().map_err(unexpected)?.domains;
        found.sort_by_key(|domain| !domain.is_default);
        Ok(found.into_iter().map(|domain| domain.domain).collect())
    }

    /// Makes an inbox, on `domain` or the default one, with an optional name, and with `identity` an agent identity
    /// for it in the same call. The inbox is made even when the identity is not; the answer then says why.
    ///
    /// # Errors
    ///
    /// [`ApiError::Refused`] at a plan limit, or as for [`Api::me`].
    pub fn create_inbox(&self, domain: Option<&str>, custom_name: Option<&str>, identity: bool) -> Result<RemoteInbox, ApiError> {
        let mut body = Map::new();
        if identity {
            body.insert("identity".to_owned(), json!({ "create": true }));
        }
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

    /// An inbox's agent identity with its password, or `None` when it has none.
    ///
    /// # Errors
    ///
    /// [`ApiError::Gone`] when the inbox ended, or as for [`Api::me`].
    pub fn inbox_identity(&self, inbox: &str) -> Result<Option<RemoteIdentity>, ApiError> {
        let detail: InboxDetail = self.get(&format!("/inboxes/{}", segment(inbox)))?.body_mut().read_json().map_err(unexpected)?;
        match (detail.identity, detail.identity_id) {
            (Some(identity), _) => Ok(Some(identity)),
            (None, Some(_)) => {
                Err(ApiError::Refused("reconnect dissolve.email in Settings, Integrations, and allow agent identities, to see this one".to_owned()))
            }
            (None, None) => Ok(None),
        }
    }

    /// Gives an inbox that has none an agent identity, with a persona.
    ///
    /// # Errors
    ///
    /// [`ApiError::Refused`] at the plan's limit or without the plan, or as for [`Api::me`].
    pub fn add_identity(&self, inbox: &str) -> Result<RemoteIdentity, ApiError> {
        let body = json!({ "inboxId": inbox, "persona": true });
        checked(self.agent.post(self.url("/identities")).header("Authorization", &self.bearer).send_json(body))?.body_mut().read_json().map_err(unexpected)
    }

    /// A new persona and password for an identity, keeping its address. The old password cannot be read again.
    ///
    /// # Errors
    ///
    /// [`ApiError::Gone`] once the inbox ended, or as for [`Api::add_identity`].
    pub fn regenerate_identity(&self, identity: &str) -> Result<RemoteIdentity, ApiError> {
        checked(self.agent.post(self.url(&format!("/identities/{}/regenerate", segment(identity)))).header("Authorization", &self.bearer).send_json(json!({})))?
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

/// What a refusal means: a plan limit with its count, a plain refusal, or slow down.
fn refusal_of(status: u16, refusal: Refusal) -> ApiError {
    let reported = refusal.limit.is_some() || refusal.available_at.is_some() || refusal.reset_at.is_some();
    let words = refusal.message.clone().or_else(|| refusal.error.clone()).unwrap_or_else(|| format!("dissolve.email answered HTTP {status}"));
    if reported && refusal.error.is_some() {
        let meter = Meter { used: refusal.used.or(refusal.current), limit: refusal.limit, reset_at: refusal.reset_at.or(refusal.available_at) };
        return ApiError::Limited { message: words, meter };
    }
    // A plan cap without a count, such as the live identities allowed, is a refusal in the server's words; any other
    // 429 is the per-minute rate: wait and try again.
    if status == 429 && refusal.error.as_deref() != Some("LIMIT_EXCEEDED") { ApiError::Slow } else { ApiError::Refused(words) }
}

/// An id safe in a path: anything but letters, digits, `-` and `_` is dropped, so an id can never reach another route.
pub(super) fn segment(id: &str) -> String {
    id.chars().filter(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_')).collect()
}

/// A cursor safe in a query: base64url passes as it is, padding is escaped, and anything else is dropped.
fn cursor_param(cursor: &str) -> String {
    cursor
        .chars()
        .filter_map(|character| match character {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' => Some(character.to_string()),
            '=' => Some("%3D".to_owned()),
            _ => None,
        })
        .collect()
}

#[allow(clippy::needless_pass_by_value, reason = "passed to map_err, which hands the error over")]
pub(super) fn unexpected<E: ToString>(error: E) -> ApiError {
    ApiError::Unreachable(error.to_string())
}

/// The response when it succeeded, otherwise what went wrong.
pub(super) fn checked(response: Result<ureq::http::Response<ureq::Body>, ureq::Error>) -> Result<ureq::http::Response<ureq::Body>, ApiError> {
    let mut response = response.map_err(unexpected)?;
    let status = response.status().as_u16();
    match status {
        200..=299 => Ok(response),
        401 => Err(ApiError::Unauthorized),
        404 | 410 => Err(ApiError::Gone),
        _ => Err(refusal_of(status, response.body_mut().read_json::<Refusal>().unwrap_or_default())),
    }
}
