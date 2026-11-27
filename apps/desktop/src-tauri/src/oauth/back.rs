//! The way back from the browser: a one-shot listener on 127.0.0.1 on a computer (RFC 8252 7.3), or the app's own
//! link on a phone (RFC 8252 7.1), and reading the answer it carries, state first.

use std::sync::Mutex;
use std::sync::mpsc::{Receiver, Sender, channel};
use std::time::{Duration, Instant};

use super::{APP_LINK, OAuthError, unreachable};

/// Decodes a query value: `+` as a space and `%XX` escapes.
pub(super) fn decode(value: &str) -> String {
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
    /// Starts waiting. A sign-in started again (to any service) replaces the one before it.
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

#[cfg(test)]
mod unit {
    use super::*;

    #[test]
    fn decodes_a_query_value() {
        assert_eq!(decode("a%20b+c%3A"), "a b c:");
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
