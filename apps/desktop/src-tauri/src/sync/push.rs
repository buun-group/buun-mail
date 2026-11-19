//! Hearing from a gateway the moment mail lands: a WebSocket to its `/v1/stream`, kept open with a ping, reconnected
//! with a growing wait when it drops. Each arrival note wakes the sync loop, which collects at once; the 30-second
//! check stays as the fallback, so nothing depends on the socket staying up.

use std::net::TcpStream;
use std::time::{Duration, Instant};

use tungstenite::client::IntoClientRequest;
use tungstenite::http::HeaderValue;
use tungstenite::stream::MaybeTlsStream;
use tungstenite::{Message, WebSocket};

/// How long a read waits before the loop sends a ping or checks it should stop.
const READ_WAIT: Duration = Duration::from_secs(20);

/// How often a ping keeps the connection known alive.
const PING_EVERY: Duration = Duration::from_secs(45);

/// The first and the longest wait before reconnecting.
const RETRY_FIRST: Duration = Duration::from_secs(5);
const RETRY_MOST: Duration = Duration::from_secs(300);

/// The stream address for a gateway: `https://` becomes `wss://`, `http://` (this computer) becomes `ws://`.
#[must_use]
pub fn stream_url(gateway: &str) -> String {
    let base = gateway.trim_end_matches('/');
    let base = base
        .strip_prefix("https://")
        .map_or_else(|| base.strip_prefix("http://").map_or_else(|| base.to_owned(), |rest| format!("ws://{rest}")), |rest| format!("wss://{rest}"));
    format!("{base}/v1/stream")
}

fn open(url: &str, token: &str) -> Result<WebSocket<MaybeTlsStream<TcpStream>>, String> {
    let mut request = url.into_client_request().map_err(|error| error.to_string())?;
    let bearer = HeaderValue::from_str(&format!("Bearer {}", token.trim())).map_err(|error| error.to_string())?;
    request.headers_mut().insert("Authorization", bearer);
    let (mut socket, _) = tungstenite::connect(request).map_err(|error| error.to_string())?;
    let tcp = match socket.get_mut() {
        MaybeTlsStream::Plain(tcp) => tcp,
        MaybeTlsStream::Rustls(tls) => tls.get_mut(),
        _ => return Err("an unexpected kind of connection".to_owned()),
    };
    tcp.set_read_timeout(Some(READ_WAIT)).map_err(|error| error.to_string())?;
    Ok(socket)
}

/// Listens to one gateway until `keep_going` says stop, calling `on_arrival` for each note that mail landed.
/// Reconnects after a drop, waiting longer each time up to five minutes, and resets the wait once connected.
pub fn listen(gateway: &str, token: &str, on_arrival: &dyn Fn(), keep_going: &dyn Fn() -> bool) {
    let url = stream_url(gateway);
    let mut wait = RETRY_FIRST;
    while keep_going() {
        if let Ok(mut socket) = open(&url, token) {
            wait = RETRY_FIRST;
            // Mail may have landed while disconnected.
            on_arrival();
            let mut pinged = Instant::now();
            while keep_going() {
                match socket.read() {
                    Ok(Message::Text(text)) if text.contains("\"arrived\"") => on_arrival(),
                    Ok(Message::Close(_)) => break,
                    Ok(_) => {}
                    Err(tungstenite::Error::Io(error)) if matches!(error.kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut) => {}
                    Err(_) => break,
                }
                if pinged.elapsed() >= PING_EVERY {
                    if socket.send(Message::text("ping")).is_err() {
                        break;
                    }
                    pinged = Instant::now();
                }
            }
            let _ = socket.close(None);
        } else {
            let until = Instant::now() + wait;
            while keep_going() && Instant::now() < until {
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

    /// Opens the real stream of the gateway in `BUUN_GATEWAY_URL` with `BUUN_GATEWAY_TOKEN`. Opt in with `--ignored`.
    #[test]
    #[ignore = "reaches a real gateway"]
    fn live_stream_opens() {
        let (Ok(url), Ok(token)) = (std::env::var("BUUN_GATEWAY_URL"), std::env::var("BUUN_GATEWAY_TOKEN")) else { return };
        let socket = open(&stream_url(&url), &token);
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
        let counted = Arc::clone(&arrivals);
        let watching = Arc::clone(&arrivals);
        // One call on connecting, one for the note; then stop.
        listen(
            &format!("http://127.0.0.1:{port}"),
            "bmg_test",
            &move || {
                counted.fetch_add(1, Ordering::SeqCst);
            },
            &move || watching.load(Ordering::SeqCst) < 2,
        );
        assert!(authorized.load(Ordering::SeqCst));
        assert_eq!(arrivals.load(Ordering::SeqCst), 2);
    }
}
