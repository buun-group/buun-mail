//! OAuth 2.1 for an installed app (RFC 8252): the server's metadata (RFC 8414), registration as a public client
//! when no client id is configured (RFC 7591), PKCE with S256, the audience a token is for (RFC 8707), and a way back
//! from the browser (`back`). Tokens are only ever handled here and in the Rust side, never by the window.
//!
//! Shared by every service the app signs in to (dissolve.email, `CryptFlare`); each keeps its own scopes and client
//! ids.

mod back;

use std::time::Duration;

use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde::Deserialize;
use serde_json::json;
use sha2::{Digest, Sha256};
use thiserror::Error;
use ureq::Agent;

pub use back::Return;
#[cfg(mobile)]
pub use back::deliver;

/// The redirect registered for a dynamically registered client on a computer. Any port on 127.0.0.1 matches it
/// (RFC 8252 7.3).
pub const REDIRECT: &str = "http://127.0.0.1/callback";

/// The redirect a phone registers: the app's private-use scheme, its reverse domain name (RFC 8252 7.1). The phone
/// opens the app with it; `tauri.android.conf.json` and `tauri.ios.conf.json` claim the scheme.
pub const APP_LINK: &str = "com.buungroup.mail:/oauth/callback";

/// The redirect this build registers its client with.
pub const REGISTERED_REDIRECT: &str = if cfg!(mobile) { APP_LINK } else { REDIRECT };

/// How long the browser has to come back before connecting gives up.
pub const SIGN_IN_WAIT: Duration = Duration::from_secs(300);

const TIMEOUT: Duration = Duration::from_secs(30);

/// Why signing in failed, in words for Settings.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum OAuthError {
    /// The server could not be reached or answered something unexpected.
    #[error("the server could not be reached: {0}")]
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
    /// The person cancelled the sign-in in the app.
    #[error("sign-in cancelled")]
    Cancelled,
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
    /// The bearer token for API calls.
    pub access: String,
    /// The token that renews it; replaced on every refresh.
    pub refresh: String,
    /// When the access token ends, Unix seconds.
    pub expires_at: i64,
    /// The scopes granted, space separated, when the server says; it can be less than asked.
    pub scope: Option<String>,
}

#[derive(Deserialize)]
struct TokenAnswer {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: i64,
    #[serde(default)]
    scope: Option<String>,
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
        .unwrap_or_else(|| format!("the server answered HTTP {status}"));
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

/// Registers this app as a public client with [`REGISTERED_REDIRECT`], and returns its client id.
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
        "redirect_uris": [REGISTERED_REDIRECT],
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

/// What one sign-in asks for: the client, the way back, the PKCE challenge, the scopes, and the audience (RFC 8707)
/// when the server issues tokens for more than one API.
pub struct Request<'a> {
    /// The client id.
    pub client_id: &'a str,
    /// The redirect, exactly as the token exchange will send it.
    pub redirect: &'a str,
    /// The state the answer must carry back.
    pub state: &'a str,
    /// The PKCE challenge.
    pub challenge: &'a str,
    /// Space separated.
    pub scopes: &'a str,
    /// The API the token is for, or `None` for the server's default.
    pub resource: Option<&'a str>,
}

/// The browser address that asks the person to approve this app.
#[must_use]
pub fn authorize_url(metadata: &Metadata, request: &Request<'_>) -> String {
    let separator = if metadata.authorization_endpoint.contains('?') { '&' } else { '?' };
    let resource = request.resource.map(|resource| format!("&resource={}", encode(resource))).unwrap_or_default();
    format!(
        "{}{separator}response_type=code&client_id={}&redirect_uri={}&scope={}&state={}&code_challenge={}&code_challenge_method=S256{resource}",
        metadata.authorization_endpoint,
        encode(request.client_id),
        encode(request.redirect),
        encode(request.scopes),
        encode(request.state),
        encode(request.challenge)
    )
}

fn tokens_of(answer: TokenAnswer, now: i64, previous_refresh: Option<&str>) -> Result<Tokens, OAuthError> {
    let refresh = answer
        .refresh_token
        .or_else(|| previous_refresh.map(str::to_owned))
        .ok_or_else(|| OAuthError::Refused("the answer carried no refresh token".to_owned()))?;
    Ok(Tokens { access: answer.access_token, refresh, expires_at: now + answer.expires_in, scope: answer.scope })
}

/// Trades the redirect's code for tokens, for `resource` when given (the same audience the request named).
///
/// # Errors
///
/// [`OAuthError`] when the server refuses or cannot be reached.
pub fn exchange(metadata: &Metadata, request: &Request<'_>, code: &str, verifier: &str, now: i64) -> Result<Tokens, OAuthError> {
    let mut form = vec![
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", request.redirect),
        ("client_id", request.client_id),
        ("code_verifier", verifier),
    ];
    if let Some(resource) = request.resource {
        form.push(("resource", resource));
    }
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
    fn makes_a_pkce_pair_and_encodes_the_request_with_its_audience() {
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
        let mut request =
            Request { client_id: "dyn_1", redirect: "http://127.0.0.1:5000/callback", state: "s t", challenge: "c", scopes: "a:b c", resource: None };
        let url = authorize_url(&metadata, &request);
        assert!(
            url.starts_with("https://api.example/oauth/authorize?response_type=code&client_id=dyn_1&redirect_uri=http%3A%2F%2F127.0.0.1%3A5000%2Fcallback")
        );
        assert!(url.contains("&scope=a%3Ab%20c") && url.contains("&state=s%20t&") && url.ends_with("code_challenge_method=S256"));
        request.resource = Some("https://api.example");
        assert!(authorize_url(&metadata, &request).ends_with("code_challenge_method=S256&resource=https%3A%2F%2Fapi.example"));
    }
}
