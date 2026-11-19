//! OAuth 2.1 for an installed app (RFC 8252): the server's metadata (RFC 8414), registration as a public client
//! when no client id is configured (RFC 7591), PKCE with S256, and a one-shot listener on 127.0.0.1 that catches the
//! browser's redirect. Tokens are only ever handled here and in the Rust side, never by the window.

use std::time::{Duration, Instant};

use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde::Deserialize;
use serde_json::json;
use sha2::{Digest, Sha256};
use thiserror::Error;
use ureq::Agent;

/// What the app asks for: who you are, your inboxes and their mail. Never the vault, webhooks or rules.
pub const SCOPES: &str = "profile email inboxes:read inboxes:write messages:read messages:write";

/// The redirect registered for a dynamically registered client. Any port on 127.0.0.1 matches it (RFC 8252 7.3).
pub const REDIRECT: &str = "http://127.0.0.1/callback";

/// How long the browser has to come back before connecting gives up.
pub const SIGN_IN_WAIT: Duration = Duration::from_secs(300);

const TIMEOUT: Duration = Duration::from_secs(30);

/// Why signing in failed, in words for Settings.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum OAuthError {
    /// The server could not be reached or answered something unexpected.
    #[error("dissolve.email could not be reached: {0}")]
    Unreachable(String),
    /// The server refused, in its own words.
    #[error("{0}")]
    Refused(String),
    /// The person declined in the browser.
    #[error("you declined in the browser")]
    Declined,
    /// The browser did not come back in time.
    #[error("the browser did not come back in time; try connecting again")]
    TimedOut,
    /// The answer did not match the request: a different state or issuer.
    #[error("the sign-in answer did not match this request, so it was ignored")]
    Mismatch,
}

/// The server's endpoints, from its metadata.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct Metadata {
    /// The issuer a redirect's `iss` must name.
    pub issuer: String,
    /// Where the browser goes.
    pub authorization_endpoint: String,
    /// Where codes and refresh tokens are traded.
    pub token_endpoint: String,
    /// Where a public client registers, when the server allows it.
    pub registration_endpoint: Option<String>,
    /// Where tokens are revoked.
    pub revocation_endpoint: Option<String>,
}

/// An access token, the refresh token that renews it, and when it ends.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Tokens {
    /// `dna_at_...`.
    pub access: String,
    /// `dna_rt_...`; replaced on every refresh.
    pub refresh: String,
    /// When the access token ends, Unix seconds.
    pub expires_at: i64,
}

#[derive(Deserialize)]
struct TokenAnswer {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: i64,
}

#[derive(Deserialize)]
struct Refusal {
    error: Option<String>,
    error_description: Option<String>,
    message: Option<String>,
}

#[derive(Deserialize)]
struct Registered {
    client_id: String,
}

fn agent() -> Agent {
    Agent::config_builder().timeout_global(Some(TIMEOUT)).http_status_as_error(false).build().new_agent()
}

#[allow(clippy::needless_pass_by_value, reason = "passed to map_err, which hands the error over")]
fn unreachable<E: ToString>(error: E) -> OAuthError {
    OAuthError::Unreachable(error.to_string())
}

/// Reads a JSON answer, or the server's refusal in its own words.
fn answer<T: serde::de::DeserializeOwned>(response: Result<ureq::http::Response<ureq::Body>, ureq::Error>) -> Result<T, OAuthError> {
    let mut response = response.map_err(unreachable)?;
    if response.status().is_success() {
        return response.body_mut().read_json::<T>().map_err(unreachable);
    }
    let status = response.status().as_u16();
    let refusal = response.body_mut().read_json::<Refusal>().ok();
    let words = refusal
        .and_then(|refusal| refusal.error_description.or(refusal.message).or(refusal.error))
        .unwrap_or_else(|| format!("dissolve.email answered HTTP {status}"));
    Err(OAuthError::Refused(words))
}

/// The server's endpoints, from `/.well-known/oauth-authorization-server` at `base`.
///
/// # Errors
///
/// [`OAuthError`] when the metadata cannot be read.
pub fn discover(base: &str) -> Result<Metadata, OAuthError> {
    answer(agent().get(format!("{}/.well-known/oauth-authorization-server", base.trim_end_matches('/'))).call())
}

/// Registers this app as a public client with the loopback redirect, and returns its client id.
///
/// # Errors
///
/// [`OAuthError::Refused`] when the server takes no registrations, or as for [`discover`].
pub fn register(metadata: &Metadata) -> Result<String, OAuthError> {
    let Some(endpoint) = &metadata.registration_endpoint else {
        return Err(OAuthError::Refused("this server takes no app registrations; set a client id in Settings".to_owned()));
    };
    let body = json!({
        "client_name": "Buun Mail",
        "redirect_uris": [REDIRECT],
        "token_endpoint_auth_method": "none",
        "grant_types": ["authorization_code", "refresh_token"],
    });
    Ok(answer::<Registered>(agent().post(endpoint).send_json(body))?.client_id)
}

/// A PKCE pair: the verifier kept here, the challenge sent with the request.
#[derive(Debug, Clone)]
pub struct Pkce {
    /// 43 characters, sent only to the token endpoint.
    pub verifier: String,
    /// The verifier's SHA-256, base64url.
    pub challenge: String,
}

/// A random base64url string from `bytes` random bytes.
///
/// # Errors
///
/// [`OAuthError::Unreachable`] when the system has no randomness to give, which should never happen.
pub fn random(bytes: usize) -> Result<String, OAuthError> {
    let mut buffer = vec![0_u8; bytes];
    getrandom::fill(&mut buffer).map_err(unreachable)?;
    Ok(URL_SAFE_NO_PAD.encode(buffer))
}

/// A fresh PKCE pair.
///
/// # Errors
///
/// As for [`random`].
pub fn pkce() -> Result<Pkce, OAuthError> {
    let verifier = random(32)?;
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    Ok(Pkce { verifier, challenge })
}

/// Percent-encodes everything but RFC 3986's unreserved characters.
fn encode(value: &str) -> String {
    value
        .bytes()
        .map(|byte| if byte.is_ascii_alphanumeric() || b"-._~".contains(&byte) { char::from(byte).to_string() } else { format!("%{byte:02X}") })
        .collect()
}

/// Decodes a query value: `+` as a space and `%XX` escapes.
fn decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while let Some(&byte) = bytes.get(index) {
        let escaped =
            (byte == b'%').then(|| bytes.get(index + 1..index + 3)).flatten().and_then(|hex| u8::from_str_radix(std::str::from_utf8(hex).ok()?, 16).ok());
        match (byte, escaped) {
            (_, Some(decoded)) => {
                out.push(decoded);
                index += 3;
            }
            (b'+', None) => {
                out.push(b' ');
                index += 1;
            }
            (other, None) => {
                out.push(other);
                index += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// The browser address that asks the person to approve this app.
#[must_use]
pub fn authorize_url(metadata: &Metadata, client_id: &str, redirect: &str, state: &str, challenge: &str) -> String {
    let separator = if metadata.authorization_endpoint.contains('?') { '&' } else { '?' };
    format!(
        "{}{separator}response_type=code&client_id={}&redirect_uri={}&scope={}&state={}&code_challenge={}&code_challenge_method=S256",
        metadata.authorization_endpoint,
        encode(client_id),
        encode(redirect),
        encode(SCOPES),
        encode(state),
        encode(challenge)
    )
}

/// A one-shot listener on 127.0.0.1, on a port the system picks, for the browser's redirect.
pub struct Loopback {
    server: tiny_http::Server,
    /// The redirect to send, with the port: `http://127.0.0.1:PORT/callback`.
    pub redirect: String,
}

/// The page the browser shows once it has handed the answer over.
const DONE_PAGE: &str = "<!doctype html><meta charset=utf-8><title>Buun Mail</title><body style=\"font:16px system-ui;background:#0b0b0c;color:#e8e8ea;display:grid;place-items:center;height:100vh;margin:0\"><p>MESSAGE You can close this tab and go back to Buun Mail.</p>";

impl Loopback {
    /// Starts listening.
    ///
    /// # Errors
    ///
    /// [`OAuthError::Unreachable`] when no port can be opened on 127.0.0.1.
    pub fn open() -> Result<Self, OAuthError> {
        let server = tiny_http::Server::http("127.0.0.1:0").map_err(unreachable)?;
        let port = server.server_addr().to_ip().map_or(0, |address| address.port());
        Ok(Self { server, redirect: format!("http://127.0.0.1:{port}/callback") })
    }

    /// Waits for the redirect and returns its code. Checks the state first, so a forged answer is never read, then
    /// the issuer when the server names one. Other requests, such as a favicon, get a 404 and the wait goes on.
    ///
    /// # Errors
    ///
    /// [`OAuthError::Declined`], [`OAuthError::Mismatch`], [`OAuthError::TimedOut`], or the server's refusal.
    pub fn wait(&self, state: &str, issuer: &str, within: Duration) -> Result<String, OAuthError> {
        let until = Instant::now() + within;
        loop {
            let left = until.saturating_duration_since(Instant::now());
            if left.is_zero() {
                return Err(OAuthError::TimedOut);
            }
            let Ok(Some(request)) = self.server.recv_timeout(left.min(Duration::from_secs(1))) else { continue };
            let url = request.url().to_owned();
            let Some(query) = url.strip_prefix("/callback?").or_else(|| (url == "/callback").then_some("")) else {
                let _ = request.respond(tiny_http::Response::empty(404));
                continue;
            };
            let field = |name: &str| query.split('&').find_map(|pair| pair.split_once('=').filter(|(key, _)| *key == name).map(|(_, value)| decode(value)));
            let other_issuer = field("iss").is_some_and(|said| said.trim_end_matches('/') != issuer.trim_end_matches('/'));
            let outcome = if field("state").as_deref() != Some(state) || other_issuer {
                Err(OAuthError::Mismatch)
            } else if let Some(error) = field("error") {
                Err(if error == "access_denied" { OAuthError::Declined } else { OAuthError::Refused(field("error_description").unwrap_or(error)) })
            } else {
                field("code").filter(|code| !code.is_empty()).ok_or_else(|| OAuthError::Refused("the answer carried no code".to_owned()))
            };
            let words = if outcome.is_ok() { "Connected." } else { "Not connected." };
            let page = tiny_http::Response::from_string(DONE_PAGE.replace("MESSAGE", words))
                .with_header(tiny_http::Header::from_bytes("Content-Type", "text/html; charset=utf-8").map_err(|()| OAuthError::Mismatch)?);
            let _ = request.respond(page);
            return outcome;
        }
    }
}

fn tokens_of(answer: TokenAnswer, now: i64, previous_refresh: Option<&str>) -> Result<Tokens, OAuthError> {
    let refresh = answer
        .refresh_token
        .or_else(|| previous_refresh.map(str::to_owned))
        .ok_or_else(|| OAuthError::Refused("the answer carried no refresh token".to_owned()))?;
    Ok(Tokens { access: answer.access_token, refresh, expires_at: now + answer.expires_in })
}

/// Trades the redirect's code for tokens.
///
/// # Errors
///
/// [`OAuthError`] when the server refuses or cannot be reached.
pub fn exchange(metadata: &Metadata, client_id: &str, code: &str, redirect: &str, verifier: &str, now: i64) -> Result<Tokens, OAuthError> {
    let form = [("grant_type", "authorization_code"), ("code", code), ("redirect_uri", redirect), ("client_id", client_id), ("code_verifier", verifier)];
    tokens_of(answer(agent().post(&metadata.token_endpoint).send_form(form))?, now, None)
}

/// New tokens for a refresh token. Save the answer at once: the old refresh token stops working.
///
/// # Errors
///
/// [`OAuthError::Refused`] when the refresh token was revoked or ran out, so the person must connect again.
pub fn refresh(metadata: &Metadata, client_id: &str, refresh_token: &str, now: i64) -> Result<Tokens, OAuthError> {
    let form = [("grant_type", "refresh_token"), ("refresh_token", refresh_token), ("client_id", client_id)];
    tokens_of(answer(agent().post(&metadata.token_endpoint).send_form(form))?, now, Some(refresh_token))
}

/// Revokes a refresh token, which ends its access tokens too. Failures are ignored: disconnecting forgets the tokens
/// here whatever the server says.
pub fn revoke(metadata: &Metadata, client_id: &str, refresh_token: &str) {
    if let Some(endpoint) = &metadata.revocation_endpoint {
        let _ = agent().post(endpoint).send_form([("token", refresh_token), ("token_type_hint", "refresh_token"), ("client_id", client_id)]);
    }
}

#[cfg(test)]
mod unit {
    use super::*;

    #[test]
    fn makes_a_pkce_pair_and_encodes_the_request() {
        let pair = pkce().unwrap_or_else(|error| unreachable!("{error}"));
        assert_eq!(pair.verifier.len(), 43);
        assert_eq!(pair.challenge, URL_SAFE_NO_PAD.encode(Sha256::digest(pair.verifier.as_bytes())));
        let metadata = Metadata {
            issuer: "https://api.example".to_owned(),
            authorization_endpoint: "https://api.example/oauth/authorize".to_owned(),
            token_endpoint: String::new(),
            registration_endpoint: None,
            revocation_endpoint: None,
        };
        let url = authorize_url(&metadata, "dyn_1", "http://127.0.0.1:5000/callback", "s t", "c");
        assert!(
            url.starts_with("https://api.example/oauth/authorize?response_type=code&client_id=dyn_1&redirect_uri=http%3A%2F%2F127.0.0.1%3A5000%2Fcallback")
        );
        assert!(url.contains("&scope=profile%20email%20inboxes%3Aread") && url.contains("&state=s%20t&") && url.ends_with("code_challenge_method=S256"));
        assert_eq!(decode("a%20b+c%3A"), "a b c:");
    }
}
