//! The sync against a fake gateway over real HTTP: it collects, takes in with the envelope recipient, acknowledges,
//! through the collect call or, for a gateway older than it, list, fetch and acknowledge.

use std::sync::{Arc, Mutex};
use std::thread;

use base64::Engine as _;
use buun_mail_routing::Router;
use buun_mail_store::{Placement, Store};
use tiny_http::{Header, Response, Server};

use super::collect::collect;
use super::gateway::{GatewayClient, GatewayError};
use crate::mailbox::Mailbox;
use crate::paths::TEST_ROUTING;

const TOKEN: &str = "bmg_test";

/// The header names Delivered-To differently on purpose: the envelope recipient must win.
const RAW: &str = "From: A client <projects@client.example>\r\nTo: list@lists.example\r\nSubject: Quote\r\nMessage-ID: <q1@client.example>\r\n\r\nCould you send the quote?\r\n";

/// What the fake gateway does.
#[derive(Clone, Copy)]
struct Kind {
    /// It has `/v1/messages/collect`; an older gateway answers it 404.
    collect: bool,
    /// Its collect answer carries the bytes inline; a large message's does not.
    inline: bool,
}

struct FakeGateway {
    url: String,
    /// Every request, as `METHOD path`.
    requests: Arc<Mutex<Vec<String>>>,
    /// The ids acknowledged, through either call.
    acknowledged: Arc<Mutex<Vec<String>>>,
}

impl FakeGateway {
    fn requests(&self) -> Vec<String> {
        self.requests.lock().map(|seen| seen.clone()).unwrap_or_default()
    }

    fn acknowledged(&self) -> Vec<String> {
        self.acknowledged.lock().map(|seen| seen.clone()).unwrap_or_default()
    }
}

/// The ids in a JSON body's `key` array.
fn ids_in(body: &str, key: &str) -> Vec<String> {
    serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|value| value.get(key).and_then(|ids| ids.as_array().cloned()))
        .unwrap_or_default()
        .iter()
        .filter_map(|id| id.as_str().map(str::to_owned))
        .collect()
}

/// Serves one waiting message for `envelope_to` until it is acknowledged, and records every request.
fn fake_gateway(envelope_to: &'static str, kind: Kind) -> FakeGateway {
    let server = Server::http("127.0.0.1:0").unwrap_or_else(|error| unreachable!("fake gateway: {error}"));
    let port = server.server_addr().to_ip().map_or(0, |address| address.port());
    let requests = Arc::new(Mutex::new(Vec::new()));
    let acknowledged = Arc::new(Mutex::new(Vec::new()));
    let (log, seen) = (Arc::clone(&requests), Arc::clone(&acknowledged));
    thread::spawn(move || {
        let waiting = |seen: &Arc<Mutex<Vec<String>>>| seen.lock().map_or(true, |done| !done.iter().any(|id| id == "mml_1"));
        let listed = |raw: Option<String>| {
            let raw = raw.map_or_else(String::new, |raw| format!(r#","raw":"{raw}""#));
            format!(r#"{{"id":"mml_1","envelopeFrom":"projects@client.example","envelopeTo":"{envelope_to}","size":1,"receivedAt":1795081417000{raw}}}"#)
        };
        for mut request in server.incoming_requests() {
            let path = request.url().to_owned();
            if let Ok(mut log) = log.lock() {
                log.push(format!("{} {}", request.method(), path.split('?').next().unwrap_or_default()));
            }
            let mut body = String::new();
            let _ = request.as_reader().read_to_string(&mut body);
            let authorized = request
                .headers()
                .iter()
                .any(|header| header.field.as_str().as_str().eq_ignore_ascii_case("Authorization") && header.value.as_str() == format!("Bearer {TOKEN}"));
            let json = Header::from_bytes("Content-Type", "application/json").unwrap_or_else(|()| unreachable!("header"));
            let response = if !authorized {
                Response::from_string(r#"{"error":"unauthorized","message":"no"}"#).with_status_code(401)
            } else if path == "/v1/messages/collect" && kind.collect {
                let acked = ids_in(&body, "ack");
                if let Ok(mut done) = seen.lock() {
                    done.extend(acked.iter().cloned());
                }
                let inline = kind.inline.then(|| base64::engine::general_purpose::STANDARD.encode(RAW));
                let messages = if waiting(&seen) { format!("[{}]", listed(inline)) } else { "[]".to_owned() };
                Response::from_string(format!(r#"{{"acknowledged":{},"messages":{messages}}}"#, acked.len())).with_header(json)
            } else if path.starts_with("/v1/messages?") {
                let messages = if waiting(&seen) { format!("[{}]", listed(None)) } else { "[]".to_owned() };
                Response::from_string(format!(r#"{{"messages":{messages}}}"#)).with_header(json)
            } else if path == "/v1/messages/mml_1/raw" {
                Response::from_string(RAW)
            } else if path == "/v1/messages/ack" {
                let acked = ids_in(&body, "ids");
                if let Ok(mut done) = seen.lock() {
                    done.extend(acked.iter().cloned());
                }
                Response::from_string(format!(r#"{{"acknowledged":{}}}"#, acked.len())).with_header(json)
            } else if path == "/v1/domains" {
                Response::from_string(r#"{"error":"refused","message":"That domain is not in this gateway's Cloudflare account."}"#)
                    .with_status_code(404)
                    .with_header(json)
            } else {
                Response::from_string(r#"{"error":true,"errorCode":"not_found","message":"Nothing here."}"#).with_status_code(404).with_header(json)
            };
            let _ = request.respond(response);
        }
    });
    FakeGateway { url: format!("http://127.0.0.1:{port}"), requests, acknowledged }
}

const CURRENT: Kind = Kind { collect: true, inline: true };

fn mailbox() -> (tempfile::TempDir, Mailbox) {
    let folder = tempfile::tempdir().unwrap_or_else(|error| unreachable!("temp folder: {error}"));
    let router = Router::from_toml(TEST_ROUTING).unwrap_or_else(|error| unreachable!("routing: {error}"));
    let store = Store::open(&folder.path().join("store")).unwrap_or_else(|error| unreachable!("store: {error}"));
    let mailbox = Mailbox::new(router, store, folder.path().join("workspaces.toml")).unwrap_or_else(|error| unreachable!("mailbox: {error}"));
    (folder, mailbox)
}

fn plotwork(mailbox: &Mailbox) -> usize {
    mailbox.messages(&Placement { workspace: "plotwork".to_owned(), folder: None }).unwrap_or_default().len()
}

#[test]
fn collects_in_two_requests_files_by_the_envelope_recipient_and_acknowledges() -> Result<(), GatewayError> {
    let gateway = fake_gateway("hello@plotwork.dev", CURRENT);
    let (_folder, mailbox) = mailbox();
    let mut legacy = false;
    let arrived = collect(&GatewayClient::new(&gateway.url, TOKEN), &mailbox, &mut legacy)?;
    assert_eq!(arrived.first().map(|message| message.to.as_str()), Some("hello@plotwork.dev"));
    assert_eq!(plotwork(&mailbox), 1, "routed by the envelope recipient, not the To header");
    assert_eq!(gateway.acknowledged(), ["mml_1"]);
    assert_eq!(gateway.requests(), ["POST /v1/messages/collect", "POST /v1/messages/collect"], "inline bytes need no fetch");
    assert!(!legacy);
    assert_eq!(collect(&GatewayClient::new(&gateway.url, TOKEN), &mailbox, &mut legacy)?.len(), 0, "nothing waits after the acknowledgement");
    Ok(())
}

#[test]
fn fetches_a_message_that_came_without_its_bytes() -> Result<(), GatewayError> {
    let gateway = fake_gateway("hello@plotwork.dev", Kind { collect: true, inline: false });
    let (_folder, mailbox) = mailbox();
    collect(&GatewayClient::new(&gateway.url, TOKEN), &mailbox, &mut false)?;
    assert_eq!(plotwork(&mailbox), 1);
    assert_eq!(gateway.requests(), ["POST /v1/messages/collect", "GET /v1/messages/mml_1/raw", "POST /v1/messages/collect"]);
    Ok(())
}

#[test]
fn falls_back_to_list_fetch_and_acknowledge_on_an_older_gateway_and_remembers() -> Result<(), GatewayError> {
    let gateway = fake_gateway("hello@plotwork.dev", Kind { collect: false, inline: false });
    let (_folder, mailbox) = mailbox();
    let mut legacy = false;
    assert_eq!(collect(&GatewayClient::new(&gateway.url, TOKEN), &mailbox, &mut legacy)?.len(), 1);
    assert!(legacy, "the 404 is remembered, so the next check goes straight to the older calls");
    assert_eq!(plotwork(&mailbox), 1);
    assert_eq!(gateway.acknowledged(), ["mml_1"]);
    assert_eq!(
        gateway.requests(),
        ["POST /v1/messages/collect", "GET /v1/messages", "GET /v1/messages/mml_1/raw", "POST /v1/messages/ack", "GET /v1/messages"]
    );
    Ok(())
}

#[test]
fn says_when_the_token_is_refused() {
    let gateway = fake_gateway("hello@plotwork.dev", CURRENT);
    let (_folder, mailbox) = mailbox();
    let result = collect(&GatewayClient::new(&gateway.url, "bmg_wrong"), &mailbox, &mut false);
    assert!(matches!(result, Err(GatewayError::Unauthorized)), "{result:?}");
}

/// Against a real gateway, run by hand: start `pnpm --filter @buun-mail/gateway dev`, send it a message, then
/// `BUUN_GATEWAY_URL=http://localhost:28620 BUUN_GATEWAY_TOKEN=bmg_... cargo test -p buun-mail-desktop -- --ignored live_gateway`.
#[test]
#[ignore = "needs a running mail gateway and a mailbox token"]
fn live_gateway() -> Result<(), GatewayError> {
    let (Ok(url), Ok(token)) = (std::env::var("BUUN_GATEWAY_URL"), std::env::var("BUUN_GATEWAY_TOKEN")) else { return Ok(()) };
    let (_folder, mailbox) = mailbox();
    let arrived = collect(&GatewayClient::new(&url, &token), &mailbox, &mut false)?;
    assert!(!arrived.is_empty(), "send the gateway a message first");
    assert!(GatewayClient::new(&url, &token).waiting()?.is_empty(), "everything collected was acknowledged");
    Ok(())
}

#[test]
fn passes_the_gateway_refusal_on_in_its_own_words() {
    let gateway = fake_gateway("hello@plotwork.dev", CURRENT);
    let refused = GatewayClient::new(&gateway.url, TOKEN).add_domain("someone-else.com", super::gateway::DomainRoute::CatchAll);
    assert!(matches!(refused, Err(GatewayError::Refused(words)) if words == "That domain is not in this gateway's Cloudflare account."));
}

/// Reads the gateway's domains and the zones it could add, run by hand like [`live_gateway`]. Changes nothing.
#[test]
#[ignore = "needs a running mail gateway and a mailbox token"]
fn live_gateway_domains() -> Result<(), GatewayError> {
    let (Ok(url), Ok(token)) = (std::env::var("BUUN_GATEWAY_URL"), std::env::var("BUUN_GATEWAY_TOKEN")) else { return Ok(()) };
    let client = GatewayClient::new(&url, &token);
    let owned = client.domains()?;
    let available = client.available()?;
    assert!(!owned.is_empty() || !available.is_empty(), "the gateway reports neither owned nor available domains");
    Ok(())
}
