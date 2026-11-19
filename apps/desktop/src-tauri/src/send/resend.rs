//! The client for Resend's API: the domains a key may send from, and sending one message. Blocking; run off the
//! window's thread.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;
use ureq::Agent;

/// Resend's API.
pub const RESEND_API: &str = "https://api.resend.com";

/// How long one call may take.
const TIMEOUT: Duration = Duration::from_secs(30);

/// Why a call to Resend failed: worth retrying, or refused for good, in words for the person.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum ResendError {
    /// Resend could not be reached, was busy or failed; trying again later may work.
    #[error("{0}")]
    Retry(String),
    /// Resend refused, in its own words; trying again will not help until something changes.
    #[error("{0}")]
    Refused(String),
}

/// One domain as Resend lists it.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct ResendDomain {
    /// The domain.
    pub name: String,
    /// Its state at Resend: `verified`, `pending`, `not_started`, `failed` or `temporary_failure`.
    pub status: String,
}

#[derive(Deserialize)]
struct DomainList {
    data: Vec<ResendDomain>,
}

/// What a key may see of its domains.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Domains {
    /// A full-access key: every domain on the account.
    Listed(Vec<ResendDomain>),
    /// A sending-only key, which may not list domains.
    Restricted,
}

/// One message as Resend's `POST /emails` takes it.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ResendEmail {
    /// `Name <address>` or the address.
    pub from: String,
    /// The To addresses.
    pub to: Vec<String>,
    /// The Cc addresses.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub cc: Vec<String>,
    /// The Bcc addresses.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub bcc: Vec<String>,
    /// The subject.
    pub subject: String,
    /// The text.
    pub text: String,
    /// Extra headers: In-Reply-To and References for a reply.
    #[serde(skip_serializing_if = "std::collections::BTreeMap::is_empty")]
    pub headers: std::collections::BTreeMap<String, String>,
    /// Files sent with it.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub attachments: Vec<ResendAttachment>,
}

/// One file as Resend takes it: its name and its bytes as base64.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ResendAttachment {
    /// The file name.
    pub filename: String,
    /// The bytes, base64.
    pub content: String,
}

/// A client for one API key.
pub struct ResendClient {
    base: String,
    key: String,
    agent: Agent,
}

impl ResendClient {
    /// A client for `key` at `base` (Resend's API, or a fake one in tests).
    #[must_use]
    pub fn new(base: &str, key: &str) -> Self {
        let agent = Agent::config_builder().timeout_global(Some(TIMEOUT)).http_status_as_error(false).build().new_agent();
        Self { base: base.trim_end_matches('/').to_owned(), key: key.trim().to_owned(), agent }
    }

    /// The domains the key may see, or that it is a sending-only key.
    ///
    /// # Errors
    ///
    /// [`ResendError`] when the key is refused or Resend cannot be reached.
    pub fn domains(&self) -> Result<Domains, ResendError> {
        let result = self.agent.get(format!("{}/domains", self.base)).header("Authorization", &self.bearer()).header("User-Agent", "buun-mail").call();
        let mut response = result.map_err(|error| ResendError::Retry(format!("Resend could not be reached: {error}")))?;
        let status = response.status().as_u16();
        let body: Value = response.body_mut().read_json().unwrap_or(Value::Null);
        if status == 200 {
            let list: DomainList = serde_json::from_value(body).map_err(|error| ResendError::Refused(format!("Resend answered unexpectedly: {error}")))?;
            return Ok(Domains::Listed(list.data));
        }
        if body.get("name").and_then(Value::as_str) == Some("restricted_api_key") {
            return Ok(Domains::Restricted);
        }
        Err(refusal(status, &body))
    }

    /// Sends one message. `idempotency` keeps a retried send from going out twice. Returns Resend's id for it.
    ///
    /// # Errors
    ///
    /// [`ResendError`] when Resend refuses it or cannot be reached.
    pub fn send(&self, email: &ResendEmail, idempotency: &str) -> Result<String, ResendError> {
        let result = self
            .agent
            .post(format!("{}/emails", self.base))
            .header("Authorization", &self.bearer())
            .header("User-Agent", "buun-mail")
            .header("Idempotency-Key", idempotency)
            .send_json(email);
        let mut response = result.map_err(|error| ResendError::Retry(format!("Resend could not be reached: {error}")))?;
        let status = response.status().as_u16();
        let body: Value = response.body_mut().read_json().unwrap_or(Value::Null);
        if (200..300).contains(&status) {
            return Ok(body.get("id").and_then(Value::as_str).unwrap_or_default().to_owned());
        }
        Err(refusal(status, &body))
    }

    fn bearer(&self) -> String {
        format!("Bearer {}", self.key)
    }
}

/// Resend's answer to a failed call, as a retry (busy, failing) or a refusal (bad key, bad message) in its own words.
fn refusal(status: u16, body: &Value) -> ResendError {
    let said = body.get("message").and_then(Value::as_str).unwrap_or("no reason given");
    match status {
        401 | 403 => ResendError::Refused(format!("Resend refused the API key: {said}")),
        429 => ResendError::Retry(format!("Resend asked to slow down: {said}")),
        500.. => ResendError::Retry(format!("Resend failed ({status}): {said}")),
        _ => ResendError::Refused(format!("Resend refused the message: {said}")),
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};
    use std::thread;

    use tiny_http::{Header, Response, Server};

    use super::*;

    /// What the fake recorded for each `POST /emails`: its idempotency key and body.
    type Posted = Arc<Mutex<Vec<(String, String)>>>;

    /// A fake Resend answering each path with a status and body, recording what was posted to `/emails`.
    fn fake(domains: (u16, &'static str), emails: (u16, &'static str)) -> (String, Posted) {
        let server = Server::http("127.0.0.1:0").unwrap_or_else(|error| unreachable!("fake resend: {error}"));
        let port = server.server_addr().to_ip().map_or(0, |address| address.port());
        let posted = Arc::new(Mutex::new(Vec::new()));
        let seen = Arc::clone(&posted);
        thread::spawn(move || {
            for mut request in server.incoming_requests() {
                let (status, body) = if request.url() == "/domains" { domains } else { emails };
                if request.url() == "/emails" {
                    let mut text = String::new();
                    let _ = request.as_reader().read_to_string(&mut text);
                    let key = request
                        .headers()
                        .iter()
                        .find(|header| header.field.equiv("Idempotency-Key"))
                        .map(|header| header.value.to_string())
                        .unwrap_or_default();
                    if let Ok(mut list) = seen.lock() {
                        list.push((key, text));
                    }
                }
                let json = Header::from_bytes("Content-Type", "application/json").unwrap_or_else(|()| unreachable!("header"));
                let _ = request.respond(Response::from_string(body).with_status_code(status).with_header(json));
            }
        });
        (format!("http://127.0.0.1:{port}"), posted)
    }

    #[test]
    fn lists_domains_for_a_full_key_and_spots_a_sending_only_one() {
        let (url, _) = fake(
            (200, r#"{"object":"list","data":[{"id":"d1","name":"flung.dev","status":"verified"},{"id":"d2","name":"new.dev","status":"pending"}]}"#),
            (200, "{}"),
        );
        assert_eq!(
            ResendClient::new(&url, "re_full").domains(),
            Ok(Domains::Listed(vec![
                ResendDomain { name: "flung.dev".to_owned(), status: "verified".to_owned() },
                ResendDomain { name: "new.dev".to_owned(), status: "pending".to_owned() }
            ]))
        );
        let (url, _) = fake((401, r#"{"statusCode":401,"name":"restricted_api_key","message":"This API key is restricted to only send emails"}"#), (200, "{}"));
        assert_eq!(ResendClient::new(&url, "re_send").domains(), Ok(Domains::Restricted));
        let (url, _) = fake((401, r#"{"statusCode":401,"name":"validation_error","message":"API key is invalid"}"#), (200, "{}"));
        assert!(matches!(ResendClient::new(&url, "re_bad").domains(), Err(ResendError::Refused(reason)) if reason.contains("API key is invalid")));
    }

    #[test]
    fn sends_with_its_idempotency_key_and_tells_refusals_from_retries() {
        let email = ResendEmail {
            from: "Flung <hi@flung.dev>".to_owned(),
            to: vec!["a@b.com".to_owned()],
            cc: Vec::new(),
            bcc: Vec::new(),
            subject: "Re: Hi".to_owned(),
            text: "Thanks".to_owned(),
            headers: std::collections::BTreeMap::from([("In-Reply-To".to_owned(), "<one@b.com>".to_owned())]),
            attachments: vec![ResendAttachment { filename: "quote.pdf".to_owned(), content: "JVBERg==".to_owned() }],
        };
        let (url, posted) = fake((200, "{}"), (200, r#"{"id":"em_1"}"#));
        assert_eq!(ResendClient::new(&url, "re_full").send(&email, "key-1"), Ok("em_1".to_owned()));
        let sent = posted.lock().map(|list| list.clone()).unwrap_or_default();
        assert_eq!(sent.first().map(|(key, _)| key.as_str()), Some("key-1"));
        let body: Value = sent.first().and_then(|(_, body)| serde_json::from_str(body).ok()).unwrap_or(Value::Null);
        assert_eq!(body["headers"]["In-Reply-To"], "<one@b.com>");
        assert_eq!(body["from"], "Flung <hi@flung.dev>");
        assert!(body.get("cc").is_none());
        assert_eq!(body["attachments"][0]["filename"], "quote.pdf");

        let (url, _) = fake((200, "{}"), (422, r#"{"name":"validation_error","message":"The flung.dev domain is not verified"}"#));
        assert!(matches!(ResendClient::new(&url, "re").send(&email, "k"), Err(ResendError::Refused(reason)) if reason.contains("not verified")));
        let (url, _) = fake((200, "{}"), (503, r#"{"message":"down"}"#));
        assert!(matches!(ResendClient::new(&url, "re").send(&email, "k"), Err(ResendError::Retry(_))));
    }
}
