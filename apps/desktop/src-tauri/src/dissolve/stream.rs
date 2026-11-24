//! dissolve.email's account stream (`GET /v1/stream`, Pro and up): one WebSocket that says the moment mail arrives in
//! any inbox the account reads, as the website does. The service collects on each event; the stream carries no mail.
//! A ping goes out every 30 seconds and its pong comes back by the server's auto-response, so an idle connection costs
//! nothing; a ping left unanswered counts as a dead connection.

use std::net::TcpStream;
use std::time::{Duration, Instant};

use serde::Deserialize;
use tungstenite::client::IntoClientRequest;
use tungstenite::http::HeaderValue;
use tungstenite::protocol::frame::coding::CloseCode;
use tungstenite::stream::MaybeTlsStream;
use tungstenite::{Message, WebSocket};

/// The exact text the server answers without waking anything.
const PING: &str = r#"{"type":"ping"}"#;

/// How a connection is kept known alive.
#[derive(Debug, Clone, Copy)]
pub struct Heartbeat {
    /// How long a read waits before the loop sends a ping or checks it should stop.
    pub read_wait: Duration,
    /// How often a ping goes out; dissolve.email asks for about every 30 seconds.
    pub ping_every: Duration,
    /// How long a ping may go unanswered before the connection counts as dead.
    pub pong_wait: Duration,
}

impl Default for Heartbeat {
    fn default() -> Self {
        Self { read_wait: Duration::from_secs(10), ping_every: Duration::from_secs(30), pong_wait: Duration::from_secs(30) }
    }
}

/// Why a stream ended, which decides what the service does next.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Ended {
    /// The token was refused or ran out (401, or close 4401): refresh it and connect again.
    TokenRefused,
    /// The plan has no live stream (403, or close 4403): collect from the changes feed on a timer instead.
    NotOnPlan,
    /// The server has no account stream (404): an older or self-hosted one.
    Unsupported,
    /// The account was deleted (close 4410): stop.
    AccountGone,
    /// The connection dropped, went quiet, or could not be opened: try again after a wait.
    Dropped,
    /// The service asked it to stop.
    Stopped,
}

#[derive(Deserialize)]
struct Event {
    #[serde(rename = "type")]
    kind: String,
}

/// True for an event after which the service should collect: new or deleted mail, or an inbox made, extended or ended.
#[must_use]
pub fn wants_collect(text: &str) -> bool {
    serde_json::from_str::<Event>(text).is_ok_and(|event| event.kind.starts_with("message.") || event.kind.starts_with("inbox."))
}

/// The stream address for a server: `https://` becomes `wss://`, `http://` (a local one) `ws://`.
#[must_use]
pub fn stream_url(server: &str) -> String {
    let base = server.trim_end_matches('/');
    let base = base
        .strip_prefix("https://")
        .map_or_else(|| base.strip_prefix("http://").map_or_else(|| base.to_owned(), |rest| format!("ws://{rest}")), |rest| format!("wss://{rest}"));
    format!("{base}/v1/stream")
}

/// What a refused upgrade means, by its HTTP status.
fn refused(status: u16) -> Ended {
    match status {
        401 => Ended::TokenRefused,
        403 => Ended::NotOnPlan,
        404 => Ended::Unsupported,
        _ => Ended::Dropped,
    }
}

/// What a close frame means, by its code.
fn closed(code: CloseCode) -> Ended {
    match u16::from(code) {
        4401 => Ended::TokenRefused,
        4403 => Ended::NotOnPlan,
        4410 => Ended::AccountGone,
        _ => Ended::Dropped,
    }
}

fn open(url: &str, token: &str, read_wait: Duration) -> Result<WebSocket<MaybeTlsStream<TcpStream>>, Ended> {
    let mut request = url.into_client_request().map_err(|_| Ended::Dropped)?;
    let bearer = HeaderValue::from_str(&format!("Bearer {}", token.trim())).map_err(|_| Ended::Dropped)?;
    request.headers_mut().insert("Authorization", bearer);
    let (mut socket, _) = tungstenite::connect(request).map_err(|error| match error {
        tungstenite::Error::Http(response) => refused(response.status().as_u16()),
        _ => Ended::Dropped,
    })?;
    let tcp = match socket.get_mut() {
        MaybeTlsStream::Plain(tcp) => tcp,
        MaybeTlsStream::Rustls(tls) => tls.get_mut(),
        _ => return Err(Ended::Dropped),
    };
    tcp.set_read_timeout(Some(read_wait)).map_err(|_| Ended::Dropped)?;
    Ok(socket)
}

/// Holds one stream open until it ends: `on_open` once connected, `on_event` for each event worth collecting on, and a
/// stop as soon as `keep_going` says so. Returns why it ended.
pub fn hold(server: &str, token: &str, heartbeat: Heartbeat, on_open: &dyn Fn(), on_event: &dyn Fn(), keep_going: &dyn Fn() -> bool) -> Ended {
    let mut socket = match open(&stream_url(server), token, heartbeat.read_wait) {
        Ok(socket) => socket,
        Err(why) => return why,
    };
    on_open();
    let mut pinged = Instant::now();
    let mut unanswered: Option<Instant> = None;
    let ended = loop {
        if !keep_going() {
            break Ended::Stopped;
        }
        match socket.read() {
            Ok(Message::Text(text)) => {
                unanswered = None;
                if wants_collect(&text) {
                    on_event();
                }
            }
            Ok(Message::Close(frame)) => break frame.map_or(Ended::Dropped, |frame| closed(frame.code)),
            Ok(_) => unanswered = None,
            Err(tungstenite::Error::Io(error)) if matches!(error.kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut) => {}
            Err(_) => break Ended::Dropped,
        }
        if unanswered.is_some_and(|since| since.elapsed() >= heartbeat.pong_wait) {
            break Ended::Dropped;
        }
        if pinged.elapsed() >= heartbeat.ping_every {
            if socket.send(Message::text(PING)).is_err() {
                break Ended::Dropped;
            }
            pinged = Instant::now();
            unanswered.get_or_insert(pinged);
        }
    };
    let _ = socket.close(None);
    ended
}

#[cfg(test)]
mod tests {
    use std::net::TcpListener;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::thread;

    use tungstenite::protocol::CloseFrame;

    use super::*;

    const QUICK: Heartbeat = Heartbeat { read_wait: Duration::from_millis(50), ping_every: Duration::from_millis(100), pong_wait: Duration::from_millis(200) };

    #[test]
    fn collects_on_mail_and_inbox_events_only() {
        assert!(wants_collect(
            r#"{"type":"message.arrived","inboxId":"i","messageId":"m","receivedAt":"x","fromAddress":"a","fromName":null,"subject":null,"hasAttachments":false}"#
        ));
        assert!(wants_collect(r#"{"type":"inbox.expired","inboxId":"i"}"#));
        assert!(!wants_collect(r#"{"type":"hello","serverTime":"x","cursor":"c","reconnectBy":null}"#));
        assert!(!wants_collect(r#"{"type":"pong"}"#));
        assert!(!wants_collect("not json"));
    }

    #[test]
    fn makes_the_stream_address_and_reads_each_ending() {
        assert_eq!(stream_url("https://api.dissolve.email/"), "wss://api.dissolve.email/v1/stream");
        assert_eq!(stream_url("http://127.0.0.1:8787"), "ws://127.0.0.1:8787/v1/stream");
        assert_eq!([refused(401), refused(403), refused(404), refused(500)], [Ended::TokenRefused, Ended::NotOnPlan, Ended::Unsupported, Ended::Dropped]);
        assert_eq!(
            [closed(CloseCode::from(4401)), closed(CloseCode::from(4403)), closed(CloseCode::from(4410)), closed(CloseCode::Restart)],
            [Ended::TokenRefused, Ended::NotOnPlan, Ended::AccountGone, Ended::Dropped]
        );
    }

    /// A stream server on this computer that runs `serve` on the first connection.
    fn server(serve: impl FnOnce(WebSocket<TcpStream>) + Send + 'static) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap_or_else(|error| unreachable!("listen: {error}"));
        let port = listener.local_addr().map_or(0, |address| address.port());
        thread::spawn(move || {
            if let Some(Ok(stream)) = listener.incoming().next()
                && let Ok(socket) = tungstenite::accept(stream)
            {
                serve(socket);
            }
        });
        format!("http://127.0.0.1:{port}")
    }

    #[test]
    fn wakes_on_an_arrival_and_reads_a_plan_downgrade_as_the_end() {
        let base = server(|mut socket| {
            let _ = socket.send(Message::text(r#"{"type":"hello","serverTime":"x","cursor":"c","reconnectBy":null}"#));
            let _ = socket.send(Message::text(r#"{"type":"message.arrived","inboxId":"i","messageId":"m","receivedAt":"x","fromAddress":"a","fromName":null,"subject":"s","hasAttachments":false}"#));
            let _ = socket.close(Some(CloseFrame { code: CloseCode::from(4403), reason: "upgrade_required".into() }));
            let _ = socket.flush();
            thread::sleep(Duration::from_millis(200));
        });
        let (opened, events) = (Arc::new(AtomicUsize::new(0)), Arc::new(AtomicUsize::new(0)));
        let (o, e) = (Arc::clone(&opened), Arc::clone(&events));
        let ended = hold(&base, "at", QUICK, &move || _ = o.fetch_add(1, Ordering::SeqCst), &move || _ = e.fetch_add(1, Ordering::SeqCst), &|| true);
        assert_eq!(ended, Ended::NotOnPlan);
        assert_eq!((opened.load(Ordering::SeqCst), events.load(Ordering::SeqCst)), (1, 1), "hello is not an arrival");
    }

    #[test]
    fn counts_a_silent_connection_as_dropped() {
        let base = server(|socket| {
            // Accepts, then never reads or answers.
            thread::sleep(Duration::from_secs(5));
            drop(socket);
        });
        let started = Instant::now();
        assert_eq!(hold(&base, "at", QUICK, &|| {}, &|| {}, &|| true), Ended::Dropped);
        assert!(started.elapsed() < Duration::from_secs(3), "the missing pong ended it, not the server");
    }
}
