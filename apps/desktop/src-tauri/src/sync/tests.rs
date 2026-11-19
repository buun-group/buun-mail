//! The sync against a fake gateway over real HTTP: it collects, takes in with the envelope recipient, acknowledges.

use std::sync::{Arc, Mutex};
use std::thread;

use buun_mail_routing::Router;
use buun_mail_store::{Placement, Store};
use tiny_http::{Header, Response, Server};

use super::gateway::{GatewayClient, GatewayError};
use super::service::collect;
use crate::mailbox::Mailbox;
use crate::paths::EXAMPLE_ROUTING;

const TOKEN: &str = "bmg_test";

/// The header names Delivered-To differently on purpose: the envelope recipient must win.
const RAW: &str = "From: A client <projects@client.example>\r\nTo: list@lists.example\r\nSubject: Quote\r\nMessage-ID: <q1@client.example>\r\n\r\nCould you send the quote?\r\n";

struct FakeGateway {
    url: String,
    acknowledged: Arc<Mutex<Vec<String>>>,
}

/// Serves one waiting message for `envelope_to`, its bytes, and records acknowledgements.
fn fake_gateway(envelope_to: &'static str) -> FakeGateway {
    let server = Server::http("127.0.0.1:0").unwrap_or_else(|error| unreachable!("fake gateway: {error}"));
    let port = server.server_addr().to_ip().map_or(0, |address| address.port());
    let acknowledged = Arc::new(Mutex::new(Vec::new()));
    let seen = Arc::clone(&acknowledged);
    thread::spawn(move || {
        for mut request in server.incoming_requests() {
            let authorized = request
                .headers()
                .iter()
                .any(|header| header.field.as_str().as_str().eq_ignore_ascii_case("Authorization") && header.value.as_str() == format!("Bearer {TOKEN}"));
            let json = Header::from_bytes("Content-Type", "application/json").unwrap_or_else(|()| unreachable!("header"));
            let response = if !authorized {
                Response::from_string(r#"{"error":"unauthorized","message":"no"}"#).with_status_code(401)
            } else if request.url().starts_with("/v1/messages?") {
                let pending = seen.lock().map_or(true, |done| done.is_empty());
                let list = if pending {
                    format!(
                        r#"{{"messages":[{{"id":"mml_1","envelopeFrom":"projects@client.example","envelopeTo":"{envelope_to}","size":1,"receivedAt":1795081417000}}]}}"#
                    )
                } else {
                    r#"{"messages":[]}"#.to_owned()
                };
                Response::from_string(list).with_header(json)
            } else if request.url() == "/v1/messages/mml_1/raw" {
                Response::from_string(RAW)
            } else if request.url() == "/v1/messages/ack" {
                let mut body = String::new();
                let _ = request.as_reader().read_to_string(&mut body);
                if let Ok(mut done) = seen.lock() {
                    done.push(body);
                }
                Response::from_string(r#"{"acknowledged":1}"#).with_header(json)
            } else if request.url() == "/v1/domains" {
                Response::from_string(r#"{"error":"refused","message":"That domain is not in this gateway's Cloudflare account."}"#)
                    .with_status_code(404)
                    .with_header(json)
            } else {
                Response::from_string("{}").with_status_code(404)
            };
            let _ = request.respond(response);
        }
    });
    FakeGateway { url: format!("http://127.0.0.1:{port}"), acknowledged }
}

fn mailbox() -> (tempfile::TempDir, Mailbox) {
    let folder = tempfile::tempdir().unwrap_or_else(|error| unreachable!("temp folder: {error}"));
    let router = Router::from_toml(EXAMPLE_ROUTING).unwrap_or_else(|error| unreachable!("routing: {error}"));
    let store = Store::open(&folder.path().join("store")).unwrap_or_else(|error| unreachable!("store: {error}"));
    let mailbox = Mailbox::new(router, store, folder.path().join("workspaces.toml")).unwrap_or_else(|error| unreachable!("mailbox: {error}"));
    (folder, mailbox)
}

#[test]
fn collects_files_by_the_envelope_recipient_and_acknowledges() -> Result<(), GatewayError> {
    let gateway = fake_gateway("hello@plotwork.dev");
    let (_folder, mailbox) = mailbox();
    let arrived = collect(&GatewayClient::new(&gateway.url, TOKEN), &mailbox)?;
    assert_eq!(arrived.len(), 1);
    assert_eq!(arrived.first().map(|message| message.to.as_str()), Some("hello@plotwork.dev"));
    let plotwork = mailbox.messages(&Placement { workspace: "plotwork".to_owned(), folder: None }).unwrap_or_default();
    assert_eq!(plotwork.len(), 1, "routed by the envelope recipient, not the To header");
    let acknowledged: Vec<serde_json::Value> =
        gateway.acknowledged.lock().map(|done| done.iter().filter_map(|body| serde_json::from_str(body).ok()).collect()).unwrap_or_default();
    assert_eq!(acknowledged, [serde_json::json!({ "ids": ["mml_1"] })]);
    assert_eq!(collect(&GatewayClient::new(&gateway.url, TOKEN), &mailbox)?.len(), 0, "nothing waits after the acknowledgement");
    Ok(())
}

#[test]
fn says_when_the_token_is_refused() {
    let gateway = fake_gateway("hello@plotwork.dev");
    let (_folder, mailbox) = mailbox();
    let result = collect(&GatewayClient::new(&gateway.url, "bmg_wrong"), &mailbox);
    assert!(matches!(result, Err(GatewayError::Unauthorized)), "{result:?}");
}

/// Against a real gateway, run by hand: start `pnpm dev:mail-gateway` in buungroup-app, send it a message, then
/// `BUUN_GATEWAY_URL=http://localhost:28509 BUUN_GATEWAY_TOKEN=bmg_... cargo test -p buun-mail-desktop -- --ignored live_gateway`.
#[test]
#[ignore = "needs a running mail gateway and a mailbox token"]
fn live_gateway() -> Result<(), GatewayError> {
    let (Ok(url), Ok(token)) = (std::env::var("BUUN_GATEWAY_URL"), std::env::var("BUUN_GATEWAY_TOKEN")) else { return Ok(()) };
    let (_folder, mailbox) = mailbox();
    let arrived = collect(&GatewayClient::new(&url, &token), &mailbox)?;
    assert!(!arrived.is_empty(), "send the gateway a message first");
    assert!(GatewayClient::new(&url, &token).waiting()?.is_empty(), "everything collected was acknowledged");
    Ok(())
}

#[test]
fn passes_the_gateway_refusal_on_in_its_own_words() {
    let gateway = fake_gateway("hello@plotwork.dev");
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
