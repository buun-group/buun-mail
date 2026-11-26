//! OAuth 2.1 for an installed app (RFC 8252): the server's metadata (RFC 8414), registration as a public client
//! when no client id is configured (RFC 7591), PKCE with S256, and a way back from the browser: on a computer a
//! one-shot listener on 127.0.0.1 (RFC 8252 7.3), on a phone the app's own link scheme (RFC 8252 7.1), which the
//! phone hands to the app. Tokens are only ever handled here and in the Rust side, never by the window.

use std::sync::Mutex;
use std::sync::mpsc::{Receiver, Sender, channel};
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

/// Added to [`SCOPES`] once the person turns agent identities on. Kept apart because dissolve.email's approval page
/// refuses a request for a scope the plan lacks, so asking for it on Free would stop the sign-in.
pub const IDENTITY_SCOPES: &str = "identities:read identities:write";

/// The scopes to ask for: [`SCOPES`], plus [`IDENTITY_SCOPES`] with `identities`.
#[must_use]
pub fn scopes(identities: bool) -> String {
    if identities { format!("{SCOPES} {IDENTITY_SCOPES}") } else { SCOPES.to_owned() }
}

/// The redirect registered for a dynamically registered client on a computer. Any port on 127.0.0.1 matches it
/// (RFC 8252 7.3).
pub const REDIRECT: &str = "http://127.0.0.1/callback";

/// The redirect a phone registers: the app's private-use scheme, its reverse domain name (RFC 8252 7.1). The phone
/// opens the app with it; `tauri.android.conf.json` and `tauri.ios.conf.json` claim the scheme.
pub const APP_LINK: &str = "com.buungroup.mail:/oauth/callback";

/// The redirect this build registers its client with.
pub const REGISTERED_REDIRECT: &str = if cfg!(mobile) { APP_LINK } else { REDIRECT };

/// Buun Mail's own client on dissolve.email, made there as code (its migrations 071 and 073): first-party, so the
/// approval page shows it as verified, with both ways back ([`REDIRECT`] and [`APP_LINK`]) already allowed.
pub const FIRST_PARTY_CLIENT: &str = "sys_buun_mail";

/// The server Buun Mail's own client lives on. Any other server (self-hosted, local) gets a registered client.
pub const FIRST_PARTY_SERVER: &str = "https://api.dissolve.email";

/// The client id to sign in with on `server` without registering: [`FIRST_PARTY_CLIENT`] on dissolve.email itself.
#[must_use]
pub fn first_party_client(server: &str) -> Option<&'static str> {
    (server.trim_end_matches('/').eq_ignore_ascii_case(FIRST_PARTY_SERVER)).then_some(FIRST_PARTY_CLIENT)
}

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
pub fn authorize_url(metadata: &Metadata, client_id: &str, redirect: &str, state: &str, challenge: &str, scopes: &str) -> String {
    let separator = if metadata.authorization_endpoint.contains('?') { '&' } else { '?' };
    format!(
        "{}{separator}response_type=code&client_id={}&redirect_uri={}&scope={}&state={}&code_challenge={}&code_challenge_method=S256",
        metadata.authorization_endpoint,
        encode(client_id),
        encode(redirect),
        encode(scopes),
        encode(state),
        encode(challenge)
    )
}

/// The code in a redirect's query. Checks the state first, so a forged answer is never read, then the issuer when
/// the server names one.
///
/// # Errors
///
/// [`OAuthError::Declined`], [`OAuthError::Mismatch`], or the server's refusal.
pub fn read_answer(query: &str, state: &str, issuer: &str) -> Result<String, OAuthError> {
    let field = |name: &str| query.split('&').find_map(|pair| pair.split_once('=').filter(|(key, _)| *key == name).map(|(_, value)| decode(value)));
    let other_issuer = field("iss").is_some_and(|said| said.trim_end_matches('/') != issuer.trim_end_matches('/'));
    if field("state").as_deref() != Some(state) || other_issuer {
        Err(OAuthError::Mismatch)
    } else if let Some(error) = field("error") {
        Err(if error == "access_denied" { OAuthError::Declined } else { OAuthError::Refused(field("error_description").unwrap_or(error)) })
    } else {
        field("code").filter(|code| !code.is_empty()).ok_or_else(|| OAuthError::Refused("the answer carried no code".to_owned()))
    }
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
            let outcome = read_answer(query, state, issuer);
            let words = if outcome.is_ok() { "Connected." } else { "Not connected." };
            let page = tiny_http::Response::from_string(DONE_PAGE.replace("MESSAGE", words))
                .with_header(tiny_http::Header::from_bytes("Content-Type", "text/html; charset=utf-8").map_err(|()| OAuthError::Mismatch)?);
            let _ = request.respond(page);
            return outcome;
        }
    }
}

/// The way back from the browser this build waits on: the listener on a computer, the app link on a phone.
pub enum Return {
    /// A computer's one-shot listener on 127.0.0.1.
    Loopback(Loopback),
    /// A phone's app link.
    AppLink(AppLink),
}

impl Return {
    /// Starts waiting the way this build does.
    ///
    /// # Errors
    ///
    /// As for [`Loopback::open`].
    pub fn open() -> Result<Self, OAuthError> {
        if cfg!(mobile) { Ok(Self::AppLink(AppLink::open())) } else { Loopback::open().map(Self::Loopback) }
    }

    /// The redirect to send with the request.
    #[must_use]
    pub fn redirect(&self) -> &str {
        match self {
            Self::Loopback(loopback) => &loopback.redirect,
            Self::AppLink(_) => APP_LINK,
        }
    }

    /// Waits for the answer and returns its code.
    ///
    /// # Errors
    ///
    /// As for [`Loopback::wait`].
    pub fn wait(&self, state: &str, issuer: &str, within: Duration) -> Result<String, OAuthError> {
        match self {
            Self::Loopback(loopback) => loopback.wait(state, issuer, within),
            Self::AppLink(link) => link.wait(state, issuer, within),
        }
    }
}

/// Where the next app link goes: the sign-in waiting for one, if any.
static WAITING: Mutex<Option<Sender<String>>> = Mutex::new(None);

/// A phone's way back: the browser opens [`APP_LINK`], the phone hands it to the app, and [`deliver`] passes it on.
pub struct AppLink {
    links: Receiver<String>,
}

impl AppLink {
    /// Starts waiting. A sign-in started again replaces the one before it.
    #[must_use]
    pub fn open() -> Self {
        let (sender, links) = channel();
        if let Ok(mut waiting) = WAITING.lock() {
            *waiting = Some(sender);
        }
        Self { links }
    }

    /// Waits for the link and returns its code, checked as [`read_answer`] does.
    ///
    /// # Errors
    ///
    /// [`OAuthError::TimedOut`], or as for [`read_answer`].
    pub fn wait(&self, state: &str, issuer: &str, within: Duration) -> Result<String, OAuthError> {
        let link = self.links.recv_timeout(within).map_err(|_| OAuthError::TimedOut)?;
        let query = link.strip_prefix(APP_LINK).map_or("", |rest| rest.trim_start_matches('?'));
        read_answer(query, state, issuer)
    }
}

/// Hands a link the phone opened the app with to the sign-in waiting for it. True when it was a sign-in answer.
#[cfg_attr(desktop, allow(dead_code, reason = "a computer signs in through the loopback listener"))]
pub fn deliver(link: &str) -> bool {
    if !link.starts_with(APP_LINK) {
        return false;
    }
    WAITING.lock().ok().and_then(|mut waiting| waiting.take()).is_some_and(|sender| sender.send(link.to_owned()).is_ok())
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
        let url = authorize_url(&metadata, "dyn_1", "http://127.0.0.1:5000/callback", "s t", "c", &scopes(false));
        assert!(
            url.starts_with("https://api.example/oauth/authorize?response_type=code&client_id=dyn_1&redirect_uri=http%3A%2F%2F127.0.0.1%3A5000%2Fcallback")
        );
        assert!(url.contains("&scope=profile%20email%20inboxes%3Aread") && url.contains("&state=s%20t&") && url.ends_with("code_challenge_method=S256"));
        assert!(!url.contains("identities"), "Free accounts could not approve a request for identities");
        assert!(
            authorize_url(&metadata, "dyn_1", "http://127.0.0.1:5000/callback", "s", "c", &scopes(true))
                .contains("messages%3Awrite%20identities%3Aread%20identities%3Awrite&")
        );
        assert_eq!(decode("a%20b+c%3A"), "a b c:");
    }

    #[test]
    fn signs_in_on_dissolve_email_as_its_own_verified_client_and_registers_anywhere_else() {
        for server in ["https://api.dissolve.email", "https://api.dissolve.email/", "HTTPS://API.DISSOLVE.EMAIL"] {
            assert_eq!(first_party_client(server), Some(FIRST_PARTY_CLIENT), "{server}");
        }
        for server in ["http://127.0.0.1:8787", "https://dissolve.example", "https://api.dissolve.email.evil"] {
            assert_eq!(first_party_client(server), None, "{server}");
        }
    }

    #[test]
    fn a_phone_signs_in_through_its_app_link_and_ignores_other_links() {
        let link = AppLink::open();
        assert!(!deliver("com.buungroup.mail:/somewhere-else"), "only the sign-in link is taken");
        assert!(deliver(&format!("{APP_LINK}?code=c%2B1&state=s1&iss=https%3A%2F%2Fapi.example%2F")));
        assert_eq!(link.wait("s1", "https://api.example", Duration::from_secs(1)), Ok("c+1".to_owned()));
        assert!(!deliver(&format!("{APP_LINK}?code=again&state=s1")), "a link with no sign-in waiting goes nowhere");

        let declined = AppLink::open();
        assert!(deliver(&format!("{APP_LINK}?error=access_denied&state=s2")));
        assert_eq!(declined.wait("s2", "https://api.example", Duration::from_secs(1)), Err(OAuthError::Declined));

        let forged = AppLink::open();
        assert!(deliver(&format!("{APP_LINK}?code=x&state=other")));
        assert_eq!(forged.wait("s3", "https://api.example", Duration::from_secs(1)), Err(OAuthError::Mismatch));

        assert_eq!(AppLink::open().wait("s4", "https://api.example", Duration::from_millis(10)), Err(OAuthError::TimedOut));
    }
}
