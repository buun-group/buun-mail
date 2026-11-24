//! Hearing from a gateway the moment mail lands: a WebSocket to its `/v1/stream`, kept known alive with a ping and its
//! pong, reconnected with a growing wait when it drops. Each arrival note, and each (re)connection, wakes the sync loop,
//! which collects at once. The loop only checks on a timer as a safety net, so a dead socket must be noticed here: a
//! ping with no pong in [`Heartbeat::pong_wait`] counts as a drop.

use std::net::TcpStream;
use std::time::{Duration, Instant};

use tungstenite::client::IntoClientRequest;
use tungstenite::http::HeaderValue;
use tungstenite::stream::MaybeTlsStream;
use tungstenite::{Message, WebSocket};

/// The first and the longest wait before reconnecting.
const RETRY_FIRST: Duration = Duration::from_secs(5);
const RETRY_MOST: Duration = Duration::from_secs(300);

/// How a connection is kept known alive. The gateway answers each ping without waking its Durable Object.
#[derive(Debug, Clone, Copy)]
pub struct Heartbeat {
    /// How long a read waits before the loop sends a ping or checks it should stop.
    pub read_wait: Duration,
    /// How often a ping goes out.
    pub ping_every: Duration,
    /// How long a ping may go unanswered before the connection counts as dead.
    pub pong_wait: Duration,
}

impl Default for Heartbeat {
    fn default() -> Self {
        Self { read_wait: Duration::from_secs(20), ping_every: Duration::from_secs(45), pong_wait: Duration::from_secs(30) }
    }
}

/// What [`listen`] reports to the sync loop.
pub struct Listener<'a> {
    /// Mail may be waiting: a note arrived, or the socket (re)connected.
    pub on_arrival: &'a dyn Fn(),
    /// The socket is up (true) or down (false).
    pub on_state: &'a dyn Fn(bool),
    /// False once the gateway is removed or its token changed.
    pub keep_going: &'a dyn Fn() -> bool,
}

/// The stream address for a gateway: `https://` becomes `wss://`, `http://` (this computer) becomes `ws://`.
#[must_use]
pub fn stream_url(gateway: &str) -> String {
    let base = gateway.trim_end_matches('/');
    let base = base
        .strip_prefix("https://")
        .map_or_else(|| base.strip_prefix("http://").map_or_else(|| base.to_owned(), |rest| format!("ws://{rest}")), |rest| format!("wss://{rest}"));
    format!("{base}/v1/stream")
}

fn open(url: &str, token: &str, read_wait: Duration) -> Result<WebSocket<MaybeTlsStream<TcpStream>>, String> {
    let mut request = url.into_client_request().map_err(|error| error.to_string())?;
    let bearer = HeaderValue::from_str(&format!("Bearer {}", token.trim())).map_err(|error| error.to_string())?;
    request.headers_mut().insert("Authorization", bearer);
    let (mut socket, _) = tungstenite::connect(request).map_err(|error| error.to_string())?;
    let tcp = match socket.get_mut() {
        MaybeTlsStream::Plain(tcp) => tcp,
        MaybeTlsStream::Rustls(tls) => tls.get_mut(),
        _ => return Err("an unexpected kind of connection".to_owned()),
    };
    tcp.set_read_timeout(Some(read_wait)).map_err(|error| error.to_string())?;
    Ok(socket)
}

/// Reads one open socket until it drops, goes quiet past its pong wait, or `keep_going` says stop.
fn hold(socket: &mut WebSocket<MaybeTlsStream<TcpStream>>, heartbeat: Heartbeat, listener: &Listener<'_>) {
    let mut pinged = Instant::now();
    // Set when a ping goes out, cleared by anything the gateway sends back.
    let mut unanswered: Option<Instant> = None;
    while (listener.keep_going)() {
        match socket.read() {
            Ok(Message::Text(text)) => {
                unanswered = None;
                if text.contains("\"arrived\"") {
                    (listener.on_arrival)();
                }
            }
            Ok(Message::Close(_)) => return,
            Ok(_) => unanswered = None,
            Err(tungstenite::Error::Io(error)) if matches!(error.kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut) => {}
            Err(_) => return,
        }
        if unanswered.is_some_and(|since| since.elapsed() >= heartbeat.pong_wait) {
            return;
        }
        if pinged.elapsed() >= heartbeat.ping_every {
            if socket.send(Message::text("ping")).is_err() {
                return;
            }
            pinged = Instant::now();
            unanswered.get_or_insert(pinged);
        }
    }
}

/// Listens to one gateway until `keep_going` says stop. Reconnects after a drop, waiting longer each time up to five
/// minutes, and resets the wait once connected. Every connection starts with a collect, for mail that landed meanwhile.
pub fn listen(gateway: &str, token: &str, heartbeat: Heartbeat, listener: &Listener<'_>) {
    let url = stream_url(gateway);
    let mut wait = RETRY_FIRST;
    while (listener.keep_going)() {
        if let Ok(mut socket) = open(&url, token, heartbeat.read_wait) {
            wait = RETRY_FIRST;
            (listener.on_state)(true);
            (listener.on_arrival)();
            hold(&mut socket, heartbeat, listener);
            let _ = socket.close(None);
            (listener.on_state)(false);
        } else {
            let until = Instant::now() + wait;
            while (listener.keep_going)() && Instant::now() < until {
                std::thread::sleep(Duration::from_millis(250));
            }
            wait = (wait * 2).min(RETRY_MOST);
        }
    }
}

#[cfg(test)]
mod tests {
    use std::net::TcpListener;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::thread;

    use tungstenite::handshake::server::{Request, Response};

    use super::*;

    /// A heartbeat fast enough for a test: read every 50 ms, ping every 100 ms, give up after 200 ms of silence.
    const QUICK: Heartbeat = Heartbeat { read_wait: Duration::from_millis(50), ping_every: Duration::from_millis(100), pong_wait: Duration::from_millis(200) };

    /// Opens the real stream of the gateway in `BUUN_GATEWAY_URL` with `BUUN_GATEWAY_TOKEN`. Opt in with `--ignored`.
    #[test]
    #[ignore = "reaches a real gateway"]
    fn live_stream_opens() {
        let (Ok(url), Ok(token)) = (std::env::var("BUUN_GATEWAY_URL"), std::env::var("BUUN_GATEWAY_TOKEN")) else { return };
        let socket = open(&stream_url(&url), &token, Heartbeat::default().read_wait);
        assert!(socket.is_ok(), "{:?}", socket.err());
    }

    #[test]
    fn makes_the_stream_address_from_the_gateway() {
        assert_eq!(stream_url("https://mail-gateway.buungroup.com/"), "wss://mail-gateway.buungroup.com/v1/stream");
        assert_eq!(stream_url("http://localhost:28509"), "ws://localhost:28509/v1/stream");
    }

    #[test]
    #[allow(clippy::result_large_err, reason = "tungstenite's handshake callback returns its own error response")]
    fn hears_an_arrival_with_the_token_and_stops_when_told() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap_or_else(|error| unreachable!("listen: {error}"));
        let port = listener.local_addr().map_or(0, |address| address.port());
        let authorized = Arc::new(AtomicBool::new(false));
        let seen = Arc::clone(&authorized);
        thread::spawn(move || {
            if let Some(Ok(stream)) = listener.incoming().next() {
                let check = |request: &Request, response: Response| {
                    seen.store(request.headers().get("Authorization").is_some_and(|value| value == "Bearer bmg_test"), Ordering::SeqCst);
                    Ok(response)
                };
                if let Ok(mut socket) = tungstenite::accept_hdr(stream, check) {
                    let _ = socket.send(Message::text(r#"{"type":"arrived","id":"mml_1"}"#));
                    thread::sleep(Duration::from_millis(300));
                }
            }
        });
        let arrivals = Arc::new(AtomicUsize::new(0));
        let states = Arc::new(std::sync::Mutex::new(Vec::new()));
        let counted = Arc::clone(&arrivals);
        let watching = Arc::clone(&arrivals);
        let recorded = Arc::clone(&states);
        // One call on connecting, one for the note; then stop.
        listen(
            &format!("http://127.0.0.1:{port}"),
            "bmg_test",
            Heartbeat::default(),
            &Listener {
                on_arrival: &move || {
                    counted.fetch_add(1, Ordering::SeqCst);
                },
                on_state: &move |up| {
                    if let Ok(mut seen) = recorded.lock() {
                        seen.push(up);
                    }
                },
                keep_going: &move || watching.load(Ordering::SeqCst) < 2,
            },
        );
        assert!(authorized.load(Ordering::SeqCst));
        assert_eq!(arrivals.load(Ordering::SeqCst), 2);
        assert_eq!(states.lock().map(|seen| seen.clone()).unwrap_or_default(), [true, false]);
    }

    #[test]
    fn reconnects_and_collects_again_when_a_ping_goes_unanswered() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap_or_else(|error| unreachable!("listen: {error}"));
        let port = listener.local_addr().map_or(0, |address| address.port());
        let connections = Arc::new(AtomicUsize::new(0));
        let accepted = Arc::clone(&connections);
        // A gateway that accepts and then never answers: the socket stays open but silent.
        thread::spawn(move || {
            let mut held = Vec::new();
            for stream in listener.incoming().take(2).flatten() {
                // Counted before the handshake: the client cannot finish connecting until this side has accepted, so
                // the count is never behind what the client saw.
                accepted.fetch_add(1, Ordering::SeqCst);
                if let Ok(socket) = tungstenite::accept(stream) {
                    held.push(socket);
                }
            }
            thread::sleep(Duration::from_secs(10));
        });
        let arrivals = Arc::new(AtomicUsize::new(0));
        let counted = Arc::clone(&arrivals);
        let watching = Arc::clone(&arrivals);
        let started = Instant::now();
        listen(
            &format!("http://127.0.0.1:{port}"),
            "bmg_test",
            QUICK,
            &Listener {
                on_arrival: &move || {
                    counted.fetch_add(1, Ordering::SeqCst);
                },
                on_state: &|_| {},
                keep_going: &move || watching.load(Ordering::SeqCst) < 2 && started.elapsed() < Duration::from_secs(20),
            },
        );
        assert_eq!(connections.load(Ordering::SeqCst), 2, "the silent socket was dropped and a new one opened");
        assert_eq!(arrivals.load(Ordering::SeqCst), 2, "each connection collected");
    }
}
