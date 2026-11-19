//! The agent server end to end: real HTTP on a free local port, against a mailbox in a temporary folder.

use std::fmt::Write as _;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::Arc;

use buun_mail_routing::Router;
use buun_mail_store::Store;
use serde_json::{Value, json};

use super::server::AgentServer;
use super::settings::AgentSettings;
use crate::mailbox::Mailbox;
use crate::paths::TEST_ROUTING;

struct Harness {
    _folder: tempfile::TempDir,
    server: AgentServer,
    port: u16,
    token: String,
}

fn harness() -> Harness {
    let folder = tempfile::tempdir().unwrap_or_else(|error| unreachable!("temp folder: {error}"));
    let router = Router::from_toml(TEST_ROUTING).unwrap_or_else(|error| unreachable!("routing: {error}"));
    let store = Store::open(&folder.path().join("store")).unwrap_or_else(|error| unreachable!("store: {error}"));
    let mailbox = Arc::new(Mailbox::new(router, store, folder.path().join("workspaces.toml")).unwrap_or_else(|error| unreachable!("mailbox: {error}")));
    let settings = AgentSettings { enabled: true, port: 0, token: "test-token".to_owned() };
    let server = AgentServer::new(mailbox, None);
    let port = server.start(&settings).unwrap_or_else(|error| unreachable!("start: {error}"));
    Harness { _folder: folder, server, port, token: settings.token }
}

/// Sends one raw HTTP request and returns the status code and body.
fn post(port: u16, headers: &[(&str, &str)], body: &str) -> (u16, String) {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap_or_else(|error| unreachable!("connect: {error}"));
    let extra = headers.iter().fold(String::new(), |mut lines, (name, value)| {
        let _ = write!(lines, "{name}: {value}\r\n");
        lines
    });
    let request = format!(
        "POST /mcp HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n{extra}\r\n{body}",
        body.len()
    );
    stream.write_all(request.as_bytes()).unwrap_or_else(|error| unreachable!("write: {error}"));
    let mut response = String::new();
    stream.read_to_string(&mut response).unwrap_or_else(|error| unreachable!("read: {error}"));
    let status = response.split_whitespace().nth(1).and_then(|code| code.parse().ok()).unwrap_or(0);
    let body = response.split("\r\n\r\n").nth(1).unwrap_or_default().to_owned();
    (status, body)
}

fn rpc(harness: &Harness, method: &str, params: &Value) -> Value {
    let auth = format!("Bearer {}", harness.token);
    let (status, body) = post(harness.port, &[("Authorization", &auth)], &json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params }).to_string());
    assert_eq!(status, 200, "{body}");
    serde_json::from_str(&body).unwrap_or_else(|error| unreachable!("json: {error}: {body}"))
}

#[test]
fn refuses_without_the_token_or_from_a_web_page() {
    let harness = harness();
    assert_eq!(post(harness.port, &[], "{}").0, 401);
    assert_eq!(post(harness.port, &[("Authorization", "Bearer wrong-token")], "{}").0, 401);
    assert_eq!(post(harness.port, &[("Authorization", "Bearer test-token"), ("Origin", "https://evil.example")], "{}").0, 403);
    harness.server.stop();
}

#[test]
fn speaks_mcp_and_lists_the_tools() {
    let harness = harness();
    let init =
        rpc(&harness, "initialize", &json!({ "protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": { "name": "claude-code", "version": "1" } }));
    assert_eq!(init.pointer("/result/serverInfo/name").and_then(Value::as_str), Some("buun-mail"));
    let tools = rpc(&harness, "tools/list", &json!({}));
    let names: Vec<_> = tools.pointer("/result/tools").and_then(Value::as_array).into_iter().flatten().filter_map(|tool| tool.get("name")?.as_str()).collect();
    assert!(names.contains(&"search_messages") && names.contains(&"add_rule"), "{names:?}");
}

#[test]
fn adds_a_rule_and_reports_a_bad_one_as_a_tool_error() {
    let harness = harness();
    let good = rpc(
        &harness,
        "tools/call",
        &json!({ "name": "add_rule", "arguments": { "rule": { "name": "Receipts", "when": { "from": "*@stripe.com" }, "actions": [{ "type": "tag", "tag": "receipt" }] } } }),
    );
    assert_eq!(good.pointer("/result/isError"), Some(&json!(false)), "{good}");
    let listed = rpc(&harness, "tools/call", &json!({ "name": "list_rules", "arguments": {} }));
    assert!(listed.to_string().contains("Receipts"));

    let bad = rpc(
        &harness,
        "tools/call",
        &json!({ "name": "add_rule", "arguments": { "rule": { "name": "All", "when": {}, "actions": [{ "type": "markRead" }] } } }),
    );
    assert_eq!(bad.pointer("/result/isError"), Some(&json!(true)));
    assert!(bad.to_string().contains("needs at least one condition"));

    let unknown = rpc(&harness, "tools/call", &json!({ "name": "delete_everything", "arguments": {} }));
    assert_eq!(unknown.pointer("/result/isError"), Some(&json!(true)));
}
