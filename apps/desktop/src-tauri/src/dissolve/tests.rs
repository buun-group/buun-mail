//! The dissolve.email integration against a fake server on this computer: discovery, registration, the browser's
//! round trip through the loopback redirect, collection into the workspace, expiry, refresh and burning.

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;

use buun_mail_routing::Router;
use buun_mail_store::{Placement, Store};
use serde_json::{Value, json};

use super::service::{DissolveService, POLLS_PER_CHECK};
use super::{IdentityChange, WORKSPACE, settings};
use crate::mailbox::Mailbox;
use crate::paths::TEST_ROUTING;

#[derive(Default)]
#[allow(clippy::struct_excessive_bools, reason = "a test double: each flag is one way the fake server behaves")]
struct Fake {
    /// id to (address, expiresAt).
    inboxes: BTreeMap<String, (String, String)>,
    /// inbox id to (message id, source when kept).
    messages: BTreeMap<String, Vec<(String, Option<String>)>>,
    /// The access token accepted now.
    accepted: String,
    /// Message lists asked for.
    polls: usize,
    /// Inboxes deleted.
    deleted: Vec<String>,
    /// The free plan's hourly creations are used up.
    hourly_full: bool,
    /// The account is on Pro, which has agent identities.
    pro: bool,
    /// The person approved agent identities for the app.
    granted: bool,
    /// inbox id to (identity id, password).
    identities: BTreeMap<String, (String, String)>,
    /// Live identities the plan allows.
    identity_cap: usize,
    /// Requests to make an inbox that asked for an identity too.
    asked_identity: usize,
    /// The server has the changes feed; an older one answers 404.
    feed: bool,
    /// The change log: (inbox id, message id, deleted), its position the cursor.
    log: Vec<(String, String, bool)>,
    /// Messages deleted through the API, as (inbox id, message id).
    deleted_messages: Vec<(String, String)>,
    /// inbox id to its aliases, as (id, address).
    aliases: BTreeMap<String, Vec<(String, String)>>,
    /// Labels put on or taken off, as (message id, label id, on).
    labelled: Vec<(String, String, bool)>,
    /// The account's identities, as the identity list answers them.
    identity_rows: Vec<Value>,
    /// Identity changes asked for, as (id, body).
    patched: Vec<(String, Value)>,
    /// Feed pages asked for.
    feed_calls: usize,
    /// The next feed read answers 410, as a cursor older than seven days does.
    expire_cursor: bool,
}

impl Fake {
    /// A new message in an inbox, kept with its source, and written to the change log.
    fn deliver(&mut self, inbox: &str, id: &str, to: &str) {
        self.messages.entry(inbox.to_owned()).or_default().push((id.to_owned(), Some(source(id, to))));
        self.log.push((inbox.to_owned(), id.to_owned(), false));
    }

    /// A message deleted on the website: gone from its inbox, and written to the change log.
    fn delete_on_website(&mut self, inbox: &str, id: &str) {
        if let Some(list) = self.messages.get_mut(inbox) {
            list.retain(|(message, _)| message != id);
        }
        self.log.push((inbox.to_owned(), id.to_owned(), true));
    }
}

/// The changes feed after `since` (`c<position>`), or its head with no cursor.
fn feed_page(fake: &mut Fake, url: &str) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    fake.feed_calls += 1;
    if std::mem::take(&mut fake.expire_cursor) {
        return json_response(410, &json!({ "error": { "code": "cursor_expired", "message": "Start again from the inboxes." } }));
    }
    let head = format!("c{}", fake.log.len());
    let since =
        url.split("since=").nth(1).and_then(|rest| rest.split('&').next()).and_then(|cursor| cursor.strip_prefix('c')).and_then(|n| n.parse::<usize>().ok());
    let after: Vec<&(String, String, bool)> = since.map_or_else(Vec::new, |from| fake.log.iter().skip(from).collect());
    let messages: Vec<Value> = after
        .iter()
        .filter(|(_, _, deleted)| !deleted)
        .map(|(inbox, id, _)| json!({ "inboxId": inbox, "id": id, "fromAddress": "hello@shop.example", "fromName": "Shop", "subject": format!("Your code {id}"), "receivedAt": "2026-11-20T10:00:00.000Z" }))
        .collect();
    let removed: Vec<Value> = after
        .iter()
        .filter(|(_, _, deleted)| *deleted)
        .map(|(inbox, id, _)| json!({ "inboxId": inbox, "messageId": id, "reason": "deleted", "at": "2026-11-20T10:05:00.000Z" }))
        .collect();
    json_response(200, &json!({ "messages": messages, "removed": removed, "nextCursor": head, "hasMore": false }))
}

/// The routes for managing an account: deleting a message, aliases, labels and the identity list. `None` for any other.
fn manage_route(fake: &mut Fake, method: &str, path: &[&str], body: &str) -> Option<tiny_http::Response<std::io::Cursor<Vec<u8>>>> {
    let asked: Value = serde_json::from_str(body).unwrap_or(Value::Null);
    let response = match (method, path) {
        ("DELETE", ["v1", "inboxes", inbox, "messages", message]) => {
            fake.deleted_messages.push(((*inbox).to_owned(), (*message).to_owned()));
            json_response(200, &json!({ "success": true }))
        }
        ("GET", ["v1", "inboxes", inbox, "aliases"]) => {
            let list = fake.aliases.get(*inbox).cloned().unwrap_or_default();
            json_response(
                200,
                &Value::Array(list.iter().map(|(id, address)| json!({ "id": id, "aliasAddress": address, "createdAt": "2026-11-20T10:00:00.000Z" })).collect()),
            )
        }
        ("POST", ["v1", "inboxes", inbox, "aliases"]) => {
            let local = asked["alias"].as_str().unwrap_or_default().to_owned();
            let list = fake.aliases.entry((*inbox).to_owned()).or_default();
            let id = format!("als_{}", list.len() + 1);
            let address = format!("{local}@dissolve.test");
            list.push((id.clone(), address.clone()));
            json_response(201, &json!({ "id": id, "aliasAddress": address, "inboxId": inbox }))
        }
        ("DELETE", ["v1", "inboxes", inbox, "aliases", alias]) => {
            if let Some(list) = fake.aliases.get_mut(*inbox) {
                list.retain(|(id, _)| id != alias);
            }
            json_response(200, &json!({ "success": true }))
        }
        ("GET", ["v1", "labels"]) => {
            json_response(200, &json!({ "labels": [{ "id": "lbl_r", "name": "Receipts", "color": "#8b5cf6" }], "limit": 50, "used": 1 }))
        }
        ("PUT" | "DELETE", ["v1", "messages", message, "labels", label]) => {
            fake.labelled.push(((*message).to_owned(), (*label).to_owned(), method == "PUT"));
            json_response(200, &json!({ "success": true }))
        }
        ("GET", ["v1", "identities"]) => json_response(200, &json!({ "identities": fake.identity_rows })),
        ("PATCH", ["v1", "identities", id]) => {
            fake.patched.push(((*id).to_owned(), asked));
            json_response(200, &json!({ "id": id }))
        }
        ("DELETE", ["v1", "identities", id]) => {
            let id = (*id).to_owned();
            fake.identity_rows.retain(|row| row["id"] != id.as_str());
            json_response(200, &json!({ "deleted": true }))
        }
        _ => return None,
    };
    Some(response)
}

/// An identity as dissolve.email answers with it.
fn identity_json(id: &str, email: &str, password: &str) -> Value {
    json!({ "id": id, "email": email, "password": password, "inboxId": "x", "label": null, "origin": "inbox", "persona": { "firstName": "Ada", "lastName": "Example", "fullName": "Ada Example", "gender": "female", "country": "GB", "username": "ada.example", "dateOfBirth": "1990-04-02", "address": { "street": "1 Fiction Row", "city": "Leeds", "state": "West Yorkshire", "zip": "LS1 1AA", "formatted": "1 Fiction Row\nLeeds\nLS1 1AA" }, "phone": "07700 900123", "synthetic": true } })
}

/// A Pro account: identities on, and the scopes this sign-in was given.
fn pro_plan(granted: bool) -> Value {
    let mut scopes = vec!["profile", "email", "inboxes:read", "inboxes:write", "messages:read", "messages:write"];
    if granted {
        scopes.extend(["identities:read", "identities:write"]);
    }
    json!({ "id": "usr_1", "email": "me@example.com", "plan": "pro", "limits": { "maxInboxes": 25, "agentIdentities": true, "maxAgentIdentities": 2 }, "connection": { "kind": "app", "scopes": scopes } })
}

fn source(id: &str, to: &str) -> String {
    format!(
        "From: Shop <hello@shop.example>\r\nTo: {to}\r\nSubject: Your code {id}\r\nMessage-ID: <{id}@shop.example>\r\nDate: Fri, 20 Nov 2026 10:00:00 +0000\r\n\r\nYour code is 482913.\r\n"
    )
}

fn json_response(status: u16, value: &Value) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    tiny_http::Response::from_string(value.to_string())
        .with_status_code(status)
        .with_header(tiny_http::Header::from_bytes("Content-Type", "application/json").unwrap_or_else(|()| unreachable!()))
}

/// The server's OAuth endpoints.
fn metadata(issuer: &str) -> Value {
    json!({ "issuer": issuer, "authorization_endpoint": format!("{issuer}/oauth/authorize"), "token_endpoint": format!("{issuer}/oauth/token"), "registration_endpoint": format!("{issuer}/oauth/register"), "revocation_endpoint": format!("{issuer}/oauth/revoke") })
}

/// Two domains, the default listed second.
fn domains() -> Value {
    json!({ "domains": [{ "id": "d-0", "domain": "other.test", "isDefault": false }, { "id": "d-1", "domain": "dissolve.test", "isDefault": true }], "defaultDomain": "dissolve.test" })
}

/// A free account and its plan's limits.
fn free_plan() -> Value {
    json!({ "id": "usr_1", "email": "me@example.com", "plan": "free", "limits": { "maxInboxes": 3, "inboxDurationMinutes": 10, "customInboxNames": false, "requestsPerMinute": 30, "hourlyCreations": 5, "maxExtensions": 1 } })
}

/// The refusal once the hour's new inboxes are used up.
fn hourly_refusal() -> Value {
    json!({ "error": "HOURLY_LIMIT_EXCEEDED", "message": "You've reached your limit of 5 new inboxes an hour on the free plan.", "limit": 5, "used": 5, "resetAt": "2099-01-01T00:00:00.000Z" })
}

/// The refusal once an inbox's extensions are used up.
fn extension_refusal() -> Value {
    json!({ "error": "EXTENSION_LIMIT_REACHED", "message": "The free plan allows 1 extension.", "limit": 1, "current": 1 })
}

/// The routes for agent identities: an inbox with its identity, making one, and regenerating it. `None` for any other.
fn identity_route(fake: &mut Fake, method: &str, path: &[&str], body: &str) -> Option<tiny_http::Response<std::io::Cursor<Vec<u8>>>> {
    let response = match (method, path) {
        ("POST", ["v1", "inboxes"]) if !fake.hourly_full => {
            let id = format!("inb_{}", fake.inboxes.len() + 1);
            let address = format!("new{}@dissolve.test", fake.inboxes.len() + 1);
            fake.inboxes.insert(id.clone(), (address.clone(), "2026-12-01T00:00:00.000Z".to_owned()));
            let asked: Value = serde_json::from_str(body).unwrap_or(Value::Null);
            let mut answer = json!({ "id": id, "address": address, "customName": "Shop", "expiresAt": "2026-12-01T00:00:00.000Z" });
            if asked["identity"]["create"] == true {
                fake.asked_identity += 1;
                if fake.identities.len() < fake.identity_cap {
                    let identity = format!("idn_{}", fake.identities.len() + 1);
                    fake.identities.insert(id.clone(), (identity.clone(), "pw-1".to_owned()));
                    answer["identity"] = identity_json(&identity, &address, "pw-1");
                } else {
                    answer["identitySkipped"] =
                        json!({ "reason": "limit", "message": "You already have 2 active agent identities, the most your plan allows." });
                }
            }
            json_response(201, &answer)
        }
        ("GET", ["v1", "inboxes", id]) => match fake.inboxes.get(*id) {
            Some((address, _)) => {
                let linked = fake.identities.get(*id);
                let mut answer = json!({ "id": id, "address": address, "identityId": linked.map(|(identity, _)| identity.clone()) });
                if let (Some((identity, password)), true) = (linked, fake.granted) {
                    answer["identity"] = identity_json(identity, address, password);
                }
                json_response(200, &answer)
            }
            None => json_response(404, &json!({ "message": "Inbox not found" })),
        },
        ("POST", ["v1", "identities"]) => {
            let asked: Value = serde_json::from_str(body).unwrap_or(Value::Null);
            let inbox = asked["inboxId"].as_str().unwrap_or_default().to_owned();
            if fake.identities.len() >= fake.identity_cap {
                json_response(429, &json!({ "error": "LIMIT_EXCEEDED", "message": "Your plan allows 2 active agent identities." }))
            } else {
                let identity = format!("idn_{}", fake.identities.len() + 1);
                let address = fake.inboxes.get(&inbox).map(|(address, _)| address.clone()).unwrap_or_default();
                fake.identities.insert(inbox, (identity.clone(), "pw-1".to_owned()));
                json_response(201, &identity_json(&identity, &address, "pw-1"))
            }
        }
        ("POST", ["v1", "identities", id, "regenerate"]) => {
            let id = (*id).to_owned();
            let found = fake.identities.iter_mut().find(|(_, (identity, _))| *identity == id).map(|(inbox, entry)| {
                entry.1 = "pw-2".to_owned();
                inbox.clone()
            });
            match found {
                Some(inbox) => {
                    let address = fake.inboxes.get(&inbox).map(|(address, _)| address.clone()).unwrap_or_default();
                    json_response(200, &identity_json(&id, &address, "pw-2"))
                }
                None => json_response(404, &json!({ "message": "Identity not found" })),
            }
        }
        _ => return None,
    };
    Some(response)
}

/// Starts the fake server; returns its address and its state.
fn fake_server() -> (String, Arc<Mutex<Fake>>) {
    let server = tiny_http::Server::http("127.0.0.1:0").unwrap_or_else(|error| unreachable!("listen: {error}"));
    let base = format!("http://127.0.0.1:{}", server.server_addr().to_ip().map_or(0, |address| address.port()));
    let state = Arc::new(Mutex::new(Fake { accepted: "at-1".to_owned(), ..Fake::default() }));
    let shared = Arc::clone(&state);
    let issuer = base.clone();
    thread::spawn(move || {
        for mut request in server.incoming_requests() {
            let mut body = String::new();
            let _ = std::io::Read::read_to_string(request.as_reader(), &mut body);
            let method = request.method().to_string();
            let url = request.url().to_owned();
            let bearer = request.headers().iter().find(|header| header.field.equiv("Authorization")).map(|header| header.value.to_string()).unwrap_or_default();
            let Ok(mut fake) = shared.lock() else { return };
            let authorized = bearer == format!("Bearer {}", fake.accepted);
            let path: Vec<&str> = url.split('?').next().unwrap_or("").trim_start_matches('/').split('/').collect();
            let identity =
                if authorized { identity_route(&mut fake, &method, &path, &body).or_else(|| manage_route(&mut fake, &method, &path, &body)) } else { None };
            let response = if let Some(response) = identity {
                response
            } else {
                match (method.as_str(), path.as_slice()) {
                    ("GET", [".well-known", "oauth-authorization-server"]) => json_response(200, &metadata(&issuer)),
                    ("POST", ["oauth", "register"]) => {
                        let asked: Value = serde_json::from_str(&body).unwrap_or(Value::Null);
                        let ok = asked["token_endpoint_auth_method"] == "none" && asked["redirect_uris"] == json!(["http://127.0.0.1/callback"]);
                        if ok {
                            json_response(201, &json!({ "client_id": "dyn_test" }))
                        } else {
                            json_response(400, &json!({ "error": "invalid_client_metadata" }))
                        }
                    }
                    ("POST", ["oauth", "token"]) => {
                        if body.contains("grant_type=authorization_code")
                            && body.contains("code=code-1")
                            && body.contains("code_verifier=")
                            && body.contains("client_id=dyn_test")
                        {
                            json_response(200, &json!({ "access_token": "at-1", "refresh_token": "rt-1", "expires_in": 3600, "token_type": "Bearer" }))
                        } else if body.contains("grant_type=refresh_token") && body.contains("refresh_token=rt-1") {
                            fake.accepted = "at-2".to_owned();
                            json_response(200, &json!({ "access_token": "at-2", "refresh_token": "rt-2", "expires_in": 3600 }))
                        } else {
                            json_response(400, &json!({ "error": "invalid_grant", "error_description": "That code is not valid." }))
                        }
                    }
                    ("POST", ["oauth", "revoke"]) => json_response(200, &json!({})),
                    _ if !authorized => json_response(401, &json!({ "message": "Unauthorized" })),
                    ("GET", ["v1", "me"]) if fake.pro => json_response(200, &pro_plan(fake.granted)),
                    ("GET", ["v1", "me"]) => json_response(200, &free_plan()),
                    ("POST", ["v1", "inboxes"]) if fake.hourly_full => json_response(429, &hourly_refusal()),
                    ("POST", ["v1", "inboxes", "inb_a", "extend"]) if fake.hourly_full => json_response(403, &extension_refusal()),
                    ("GET", ["v1", "inboxes"]) => json_response(
                        200,
                        &Value::Array(
                            fake.inboxes
                                .iter()
                                .map(|(id, (address, expires))| json!({ "id": id, "address": address, "customName": null, "expiresAt": expires }))
                                .collect(),
                        ),
                    ),
                    ("GET", ["v1", "domains"]) => json_response(200, &domains()),
                    ("GET", ["v1", "messages"]) if fake.feed => feed_page(&mut fake, &url),
                    ("POST", ["v1", "inboxes", id, "extend"]) => {
                        let id = (*id).to_owned();
                        match fake.inboxes.get_mut(&id) {
                            Some(found) => {
                                found.1 = "2026-12-24T00:00:00.000Z".to_owned();
                                json_response(200, &json!({ "id": id, "address": found.0, "expiresAt": found.1 }))
                            }
                            None => json_response(404, &json!({ "message": "Inbox not found" })),
                        }
                    }
                    ("DELETE", ["v1", "inboxes", id]) => {
                        let id = (*id).to_owned();
                        fake.inboxes.remove(&id);
                        fake.deleted.push(id);
                        json_response(200, &json!({ "success": true }))
                    }
                    ("GET", ["v1", "inboxes", id, "messages"]) => {
                        fake.polls += 1;
                        let list = fake.messages.get(*id).cloned().unwrap_or_default();
                        json_response(
                        200,
                        &Value::Array(list.iter().map(|(message, _)| json!({ "id": message, "fromAddress": "hello@shop.example", "fromName": "Shop", "subject": format!("Your code {message}"), "bodyText": "Your code is 482913.", "receivedAt": "2026-11-20T10:00:00.000Z" })).collect()),
                    )
                    }
                    ("GET", ["v1", "inboxes", id, "messages", message, "eml"]) => {
                        match fake.messages.get(*id).and_then(|list| list.iter().find(|(found, _)| found == message)).and_then(|(_, raw)| raw.clone()) {
                            Some(raw) => tiny_http::Response::from_string(raw).with_status_code(200),
                            None => json_response(404, &json!({ "error": "RAW_UNAVAILABLE" })),
                        }
                    }
                    _ => json_response(404, &json!({ "message": "Not found" })),
                }
            };
            drop(fake);
            let _ = request.respond(response);
        }
    });
    (base, state)
}

/// What opens the browser.
type Browser = Box<dyn Fn(&str) -> Result<(), String> + Send + Sync>;

/// A browser that approves (or declines) at once: it follows the authorize address back to the loopback redirect.
fn browser(issuer: String, answer: &'static str) -> Browser {
    Box::new(move |url: &str| {
        let query = url.split_once('?').map_or("", |(_, query)| query).to_owned();
        let field = |name: &str| query.split('&').find_map(|pair| pair.strip_prefix(&format!("{name}="))).unwrap_or("").to_owned();
        let redirect = field("redirect_uri").replace("%3A", ":").replace("%2F", "/");
        let back = format!("{redirect}?{answer}&state={}&iss={}", field("state"), issuer);
        thread::spawn(move || {
            let _ = ureq::get(&back).call();
        });
        Ok(())
    })
}

struct Setup {
    _folder: tempfile::TempDir,
    config: PathBuf,
    mailbox: Arc<Mailbox>,
    fake: Arc<Mutex<Fake>>,
    base: String,
}

fn setup() -> Setup {
    let folder = tempfile::tempdir().unwrap_or_else(|error| unreachable!("temp: {error}"));
    let router = Router::from_toml(TEST_ROUTING).unwrap_or_else(|error| unreachable!("routing: {error}"));
    let store = Store::open(&folder.path().join("store")).unwrap_or_else(|error| unreachable!("store: {error}"));
    let mailbox = Arc::new(Mailbox::new(router, store, folder.path().join("workspaces.toml")).unwrap_or_else(|error| unreachable!("mailbox: {error}")));
    let (base, fake) = fake_server();
    if let Ok(mut state) = fake.lock() {
        state.inboxes.insert("inb_a".to_owned(), ("signup@dissolve.test".to_owned(), "2026-11-21T00:00:00.000Z".to_owned()));
        state.messages.insert("inb_a".to_owned(), vec![("msg_1".to_owned(), Some(source("msg_1", "signup@dissolve.test"))), ("msg_2".to_owned(), None)]);
    }
    let config = folder.path().join("config");
    Setup { _folder: folder, config, mailbox, fake, base }
}

fn connected(setup: &Setup) -> DissolveService {
    let service = DissolveService::new(setup.config.clone(), Arc::clone(&setup.mailbox), None, browser(setup.base.clone(), "code=code-1"));
    let status = service.connect(Some(&setup.base), None).unwrap_or_else(|error| unreachable!("connect: {error}"));
    assert!(status.connected);
    service
}

fn folder_of(setup: &Setup, address: &str) -> Vec<String> {
    let placement = Placement { workspace: WORKSPACE.to_owned(), folder: Some(address.to_owned()) };
    setup.mailbox.messages(&placement).unwrap_or_default().into_iter().map(|message| message.subject).collect()
}

#[test]
fn connects_through_the_browser_and_files_each_inbox_in_its_folder() {
    let setup = setup();
    let service = connected(&setup);
    let status = service.status().unwrap_or_else(|error| unreachable!("{error}"));
    assert_eq!((status.email.as_deref(), status.plan.as_deref()), (Some("me@example.com"), Some("free")));
    assert_eq!(status.inboxes.first().map(|inbox| (inbox.address.as_str(), inbox.stored)), Some(("signup@dissolve.test", 2)));

    let mut subjects = folder_of(&setup, "signup@dissolve.test");
    subjects.sort();
    // One from its original, one rebuilt from the API's fields because the original was not kept.
    assert_eq!(subjects, vec!["Your code msg_1", "Your code msg_2"]);
    let workspaces = setup.mailbox.workspaces().unwrap_or_default();
    let dissolve = workspaces
        .iter()
        .find(|workspace| workspace.id == WORKSPACE)
        .map(|workspace| workspace.folders.iter().filter_map(|folder| folder.name.clone()).collect::<Vec<_>>());
    assert_eq!(dissolve, Some(vec!["signup@dissolve.test".to_owned()]));

    // Tokens are saved for this user only, and the next check takes nothing twice.
    let saved = settings::load(&setup.config);
    assert_eq!((saved.client_id.as_str(), saved.account.map(|account| account.refresh_token)), ("dyn_test", Some("rt-1".to_owned())));
    assert_eq!(service.check(), Ok(0));
}

#[test]
fn deletes_an_ended_inbox_mail_unless_kept() {
    let setup = setup();
    let service = connected(&setup);
    if let Ok(mut fake) = setup.fake.lock() {
        fake.inboxes.clear();
    }
    assert_eq!(service.check(), Ok(0));
    assert_eq!(folder_of(&setup, "signup@dissolve.test"), Vec::<String>::new());
    assert!(service.status().is_ok_and(|status| status.inboxes.is_empty()));

    let kept = self::setup();
    let service = connected(&kept);
    let _ = service.set_keep_after_expiry(true);
    if let Ok(mut fake) = kept.fake.lock() {
        fake.inboxes.clear();
    }
    assert_eq!(service.check(), Ok(0));
    assert_eq!(folder_of(&kept, "signup@dissolve.test").len(), 2);
    assert!(service.status().is_ok_and(|status| status.inboxes.first().is_some_and(|inbox| inbox.ended)));
}

#[test]
fn refreshes_a_refused_token_once_and_carries_on() {
    let setup = setup();
    let service = connected(&setup);
    if let Ok(mut fake) = setup.fake.lock() {
        fake.accepted = "at-2".to_owned();
        fake.messages.entry("inb_a".to_owned()).or_default().push(("msg_3".to_owned(), Some(source("msg_3", "signup@dissolve.test"))));
    }
    assert_eq!(service.check(), Ok(1));
    assert_eq!(settings::load(&setup.config).account.map(|account| account.refresh_token), Some("rt-2".to_owned()));
}

#[test]
fn makes_extends_and_burns_inboxes() {
    let setup = setup();
    let service = connected(&setup);
    assert_eq!(service.domains(), Ok(vec!["dissolve.test".to_owned(), "other.test".to_owned()]));
    let made = service.create_inbox(None, Some("Shop"), false).unwrap_or_else(|error| unreachable!("create: {error}")).inbox;
    assert_eq!(made.address, "new2@dissolve.test");
    let extended = service.extend_inbox(&made.id).unwrap_or_else(|error| unreachable!("extend: {error}"));
    assert!(extended.inboxes.iter().any(|inbox| inbox.id == made.id && inbox.expires_at.starts_with("2026-12-24")));

    let burned = service.burn_inbox("inb_a").unwrap_or_else(|error| unreachable!("burn: {error}"));
    assert!(burned.inboxes.iter().all(|inbox| inbox.id != "inb_a"));
    assert_eq!(folder_of(&setup, "signup@dissolve.test"), Vec::<String>::new());
    assert!(setup.fake.lock().is_ok_and(|fake| fake.deleted == vec!["inb_a".to_owned()]));
}

#[test]
fn polls_a_few_inboxes_a_check_in_turn() {
    let setup = setup();
    if let Ok(mut fake) = setup.fake.lock() {
        for index in 0..6 {
            fake.inboxes.insert(format!("inb_{index}"), (format!("box{index}@dissolve.test"), "2026-11-21T00:00:00.000Z".to_owned()));
        }
    }
    let service = connected(&setup);
    let after_connect = setup.fake.lock().map_or(0, |fake| fake.polls);
    assert_eq!(after_connect, POLLS_PER_CHECK);
    let _ = service.check();
    assert_eq!(setup.fake.lock().map_or(0, |fake| fake.polls), POLLS_PER_CHECK * 2);
}

#[test]
fn refuses_a_decline_a_forged_answer_and_plain_text_servers() {
    let setup = setup();
    let declined = DissolveService::new(setup.config.clone(), Arc::clone(&setup.mailbox), None, browser(setup.base.clone(), "error=access_denied"));
    assert_eq!(declined.connect(Some(&setup.base), None).err().as_deref(), Some("you declined in the browser"));
    let forged = DissolveService::new(setup.config.clone(), Arc::clone(&setup.mailbox), None, browser("https://evil.example".to_owned(), "code=code-1"));
    assert!(forged.connect(Some(&setup.base), None).is_err_and(|error| error.contains("did not match")));
    assert!(declined.connect(Some("http://dissolve.example"), None).is_err_and(|error| error.contains("https")));
    assert!(declined.status().is_ok_and(|status| !status.connected));
}

#[test]
fn shows_the_plan_limits_and_records_the_ones_it_hits() {
    let setup = setup();
    let service = connected(&setup);
    let limits = service.status().unwrap_or_else(|error| unreachable!("{error}")).limits;
    assert_eq!(limits.plan.as_deref(), Some("free"));
    assert_eq!((limits.inboxes.used, limits.inboxes.limit), (Some(1), Some(3)));
    assert_eq!((limits.hourly_creations.used, limits.hourly_creations.limit), (None, Some(5)));
    assert_eq!((limits.inbox_minutes, limits.extensions_per_inbox, limits.custom_names), (Some(10), Some(1), Some(false)));
    assert!(limits.requests.used.is_some_and(|used| used > 0) && limits.requests.limit == Some(30));
    assert_eq!((limits.message_checks.used, limits.message_checks.limit), (Some(4), Some(5)));

    if let Ok(mut fake) = setup.fake.lock() {
        fake.hourly_full = true;
    }
    // The hourly limit reads as dissolve.email said it, not as slow down, and its count shows.
    assert_eq!(service.create_inbox(None, None, false).err().as_deref(), Some("You've reached your limit of 5 new inboxes an hour on the free plan."));
    let hourly = service.status().map(|status| status.limits.hourly_creations).unwrap_or_default();
    assert_eq!((hourly.used, hourly.limit, hourly.reset_at.as_deref()), (Some(5), Some(5), Some("2099-01-01T00:00:00.000Z")));

    assert_eq!(service.extend_inbox("inb_a").err().as_deref(), Some("The free plan allows 1 extension."));
    let extensions = service.status().ok().and_then(|status| status.inboxes.into_iter().find(|inbox| inbox.id == "inb_a")).and_then(|inbox| inbox.extensions);
    assert_eq!(extensions.map(|found| (found.used, found.limit, found.can_extend)), Some((Some(1), Some(1), Some(false))));
}

#[test]
fn makes_an_agent_identity_with_a_new_address_once_allowed_on_a_plan_that_has_them() {
    let setup = setup();
    if let Ok(mut fake) = setup.fake.lock() {
        fake.pro = true;
        fake.identity_cap = 2;
    }
    let service = connected(&setup);
    let identities = service.status().unwrap_or_else(|error| unreachable!("{error}")).identities;
    assert_eq!((identities.plan, identities.granted, identities.with_new), (Some(true), false, true), "a first sign-in never asks for identities");

    // Not yet allowed: the inbox is made without asking, since dissolve.email would refuse the whole request.
    let made = service.create_inbox(None, None, true).unwrap_or_else(|error| unreachable!("create: {error}"));
    assert!(made.identity_made.is_none() && made.identity_skipped.is_none());
    assert_eq!(setup.fake.lock().map_or(9, |fake| fake.asked_identity), 0);

    // Turning them on signs in again, asking for the identity scopes this time.
    let fake = Arc::clone(&setup.fake);
    let approve = browser(setup.base.clone(), "code=code-1");
    let allowing = DissolveService::new(
        setup.config.clone(),
        Arc::clone(&setup.mailbox),
        None,
        Box::new(move |url: &str| {
            if let Ok(mut state) = fake.lock() {
                state.granted = url.contains("identities%3Awrite");
            }
            approve(url)
        }),
    );
    let status = allowing.connect(None, Some(true)).unwrap_or_else(|error| unreachable!("connect: {error}"));
    assert!(status.identities.granted);
    let heard = listen(&allowing);

    let made = allowing.create_inbox(None, None, true).unwrap_or_else(|error| unreachable!("create: {error}"));
    let identity = made.identity_made.unwrap_or_else(|| unreachable!("no identity"));
    assert_eq!((identity.email.as_str(), identity.has_password), (made.inbox.address.as_str(), true));
    assert_eq!(identity.persona.map(|persona| persona.full_name), Some("Ada Example".to_owned()));
    assert!(made.inbox.identity);
    let status = allowing.status().unwrap_or_else(|error| unreachable!("{error}"));
    assert_eq!((status.identities.live.used, status.identities.live.limit), (Some(1), Some(2)));

    // The password is read from dissolve.email when revealed, and never written to this computer.
    assert_eq!(allowing.identity_password(&made.inbox.id), Ok(Some("pw-1".to_owned())));
    let regenerated = allowing.regenerate_identity(&made.inbox.id).unwrap_or_else(|error| unreachable!("regenerate: {error}"));
    assert_eq!(regenerated.id, identity.id);
    assert_eq!(allowing.identity_password(&made.inbox.id), Ok(Some("pw-2".to_owned())));
    let saved = std::fs::read_to_string(setup.config.join("dissolve.json")).unwrap_or_default();
    assert!(!saved.contains("pw-") && saved.contains(&identity.id));

    // Whoever listens (CryptFlare) hears the made identity and its replacement, each with its password and persona.
    let passwords: Vec<(Option<String>, bool)> = heard
        .lock()
        .map(|changes| {
            changes
                .iter()
                .filter_map(|change| match change {
                    IdentityChange::Saved(record) => {
                        Some((record.password.clone(), record.persona.is_some() && record.inbox_id.as_deref() == Some(made.inbox.id.as_str())))
                    }
                    _ => None,
                })
                .collect()
        })
        .unwrap_or_default();
    assert_eq!(passwords, vec![(Some("pw-1".to_owned()), true), (Some("pw-2".to_owned()), true)]);

    // An address without one can be given one, up to the plan's cap, which reads in dissolve.email's words.
    assert_eq!(allowing.identity("inb_a"), Ok(None));
    assert!(allowing.add_identity("inb_a").is_ok_and(|added| added.has_password));
    assert_eq!(allowing.add_identity("inb_2").err().as_deref(), Some("Your plan allows 2 active agent identities."));
    let skipped = allowing.create_inbox(None, None, true).unwrap_or_else(|error| unreachable!("create: {error}"));
    assert_eq!(skipped.identity_skipped.as_deref(), Some("You already have 2 active agent identities, the most your plan allows."));

    // Making one with each new address can be turned off.
    assert!(allowing.set_identity_with_new(false).is_ok_and(|status| !status.identities.with_new));
}

#[test]
fn reads_new_mail_from_the_changes_feed_in_one_call_after_one_sweep() {
    let setup = setup();
    if let Ok(mut fake) = setup.fake.lock() {
        fake.feed = true;
    }
    // Connecting takes the feed's head, then polls each inbox once for the mail from before it.
    let service = connected(&setup);
    assert_eq!(folder_of(&setup, "signup@dissolve.test").len(), 2);
    let polls = setup.fake.lock().map_or(0, |fake| fake.polls);
    assert_eq!(polls, 1);
    assert_eq!(settings::load(&setup.config).cursor.as_deref(), Some("c0"));

    if let Ok(mut fake) = setup.fake.lock() {
        fake.deliver("inb_a", "msg_3", "signup@dissolve.test");
    }
    assert_eq!(service.check(), Ok(1));
    assert!(folder_of(&setup, "signup@dissolve.test").contains(&"Your code msg_3".to_owned()));
    assert_eq!(setup.fake.lock().map_or(0, |fake| fake.polls), polls, "the feed brought it, no inbox was polled");
    assert_eq!(settings::load(&setup.config).cursor.as_deref(), Some("c1"), "a restart carries on from here");
    assert_eq!(service.check(), Ok(0), "nothing is taken twice");
}

#[test]
fn starts_the_feed_again_when_its_cursor_expired() {
    let setup = setup();
    if let Ok(mut fake) = setup.fake.lock() {
        fake.feed = true;
    }
    let service = connected(&setup);
    if let Ok(mut fake) = setup.fake.lock() {
        fake.deliver("inb_a", "msg_3", "signup@dissolve.test");
        fake.expire_cursor = true;
    }
    // The 410 drops the cursor; the same check takes the head again and sweeps the inbox, which finds msg_3.
    assert_eq!(service.check(), Ok(1));
    assert_eq!(settings::load(&setup.config).cursor.as_deref(), Some("c1"));
    assert_eq!(setup.fake.lock().map_or(0, |fake| fake.polls), 2);
}

#[test]
fn polls_inbox_by_inbox_on_a_server_without_the_feed_and_asks_for_it_only_hourly() {
    let setup = setup();
    let service = connected(&setup);
    if let Ok(mut fake) = setup.fake.lock() {
        fake.messages.entry("inb_a".to_owned()).or_default().push(("msg_3".to_owned(), Some(source("msg_3", "signup@dissolve.test"))));
    }
    assert_eq!(service.check(), Ok(1));
    assert_eq!(settings::load(&setup.config).cursor, None);
    assert_eq!(setup.fake.lock().map_or(0, |fake| fake.feed_calls), 0, "the 404 route is not the feed handler");
}

/// A connected service with the feed on and its first sweep done.
fn with_feed() -> (Setup, DissolveService) {
    let setup = setup();
    if let Ok(mut fake) = setup.fake.lock() {
        fake.feed = true;
    }
    let service = connected(&setup);
    (setup, service)
}

/// The id stored here for a message of `inb_a`.
fn stored_id(setup: &Setup, message: &str) -> String {
    settings::load(&setup.config).inboxes.get("inb_a").and_then(|known| known.messages.get(message).cloned()).unwrap_or_default()
}

#[test]
fn deletes_here_what_was_deleted_on_the_website() {
    let (setup, service) = with_feed();
    if let Ok(mut fake) = setup.fake.lock() {
        fake.delete_on_website("inb_a", "msg_1");
    }
    assert_eq!(service.check(), Ok(0));
    assert_eq!(folder_of(&setup, "signup@dissolve.test"), vec!["Your code msg_2".to_owned()]);
    assert_eq!(stored_id(&setup, "msg_1"), "", "the link went with it");
    assert!(setup.fake.lock().is_ok_and(|fake| fake.deleted_messages.is_empty()), "a deletion from the website is not sent back");
}

#[test]
fn deletes_on_dissolve_what_was_deleted_for_good_here_and_never_takes_it_in_again() {
    let (setup, service) = with_feed();
    service.watch_changes();
    let id = stored_id(&setup, "msg_1");
    assert_eq!(setup.mailbox.delete_forever(std::slice::from_ref(&id), &crate::mailbox::Actor::You).ok(), Some(1));
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    while setup.fake.lock().is_ok_and(|fake| fake.deleted_messages.is_empty()) && std::time::Instant::now() < deadline {
        thread::sleep(std::time::Duration::from_millis(20));
    }
    assert!(setup.fake.lock().is_ok_and(|fake| fake.deleted_messages == vec![("inb_a".to_owned(), "msg_1".to_owned())]));
    assert_eq!(stored_id(&setup, "msg_1"), "");
    // The app's own deletions (an inbox that ended) are never sent.
    let other = stored_id(&setup, "msg_2");
    let _ = setup.mailbox.delete_forever(&[other], &crate::mailbox::Actor::App);
    thread::sleep(std::time::Duration::from_millis(100));
    assert_eq!(setup.fake.lock().map_or(0, |fake| fake.deleted_messages.len()), 1);
}

#[test]
fn puts_the_label_named_like_a_tag_on_the_message_there() {
    let (setup, service) = with_feed();
    let id = stored_id(&setup, "msg_1");
    service.mirror_tag(&id, "receipts", true);
    service.mirror_tag(&id, "No such label", true);
    service.mirror_tag(&id, "Receipts", false);
    service.mirror_tag("not-from-dissolve", "Receipts", true);
    let labelled = setup.fake.lock().map(|fake| fake.labelled.clone()).unwrap_or_default();
    assert_eq!(labelled, vec![("msg_1".to_owned(), "lbl_r".to_owned(), true), ("msg_1".to_owned(), "lbl_r".to_owned(), false)]);
}

#[test]
fn adds_lists_and_removes_an_inbox_alias() {
    let (_setup, service) = with_feed();
    assert_eq!(service.aliases("inb_a"), Ok(Vec::new()));
    let added = service.add_alias("inb_a", " Billing ").unwrap_or_else(|error| unreachable!("add: {error}"));
    assert_eq!(added.iter().map(|alias| alias.address.as_str()).collect::<Vec<_>>(), vec!["billing@dissolve.test"]);
    assert!(service.add_alias("inb_a", "  ").is_err());
    let id = added.first().map(|alias| alias.id.clone()).unwrap_or_default();
    assert_eq!(service.remove_alias("inb_a", &id), Ok(Vec::new()));
}

#[test]
fn extends_and_renames_an_identity_without_shortening_it_and_deletes_it_keeping_the_inbox() {
    let (setup, service) = with_feed();
    let ends = buun_mail_message::rfc3339(crate::mailbox::unix_now() + 2 * 60 * 60);
    if let Ok(mut fake) = setup.fake.lock() {
        fake.identity_rows = vec![json!({ "id": "idn_9", "email": "signup@dissolve.test", "inboxId": "inb_a", "label": null, "expiresAt": ends })];
    }
    let rows = service.identities().unwrap_or_else(|error| unreachable!("list: {error}"));
    assert_eq!(rows.first().and_then(|row| row.inbox.clone()), Some("inb_a".to_owned()));
    let heard = listen(&service);

    let _ = service.update_identity("idn_9", false, Some("GitHub"));
    let _ = service.update_identity("idn_9", true, None);
    let patched = setup.fake.lock().map(|fake| fake.patched.clone()).unwrap_or_default();
    let minutes: Vec<i64> = patched.iter().filter_map(|(_, body)| body["ttlMinutes"].as_i64()).collect();
    // About two hours left: a rename keeps them, Extend adds the free plan's ten minutes of inbox time.
    assert!(minutes.first().is_some_and(|left| (119..=120).contains(left)), "{minutes:?}");
    assert!(minutes.get(1).is_some_and(|more| (129..=130).contains(more)), "{minutes:?}");
    assert_eq!(patched.first().map(|(_, body)| body["label"].clone()), Some(json!("GitHub")));

    assert_eq!(service.delete_identity("idn_9"), Ok(Vec::new()));

    // A rename or an extension is heard without a password, and a deleted identity as ended.
    let changes = heard.lock().map(|changes| changes.clone()).unwrap_or_default();
    assert!(
        matches!(changes.first(), Some(IdentityChange::Updated(record)) if record.password.is_none() && record.email == "signup@dissolve.test"),
        "{changes:?}"
    );
    assert_eq!(changes.last(), Some(&IdentityChange::Ended { identity_id: Some("idn_9".to_owned()), email: "signup@dissolve.test".to_owned() }));
}

/// Collects every identity change `service` makes.
fn listen(service: &DissolveService) -> Arc<Mutex<Vec<IdentityChange>>> {
    let heard = Arc::new(Mutex::new(Vec::new()));
    let sink = Arc::clone(&heard);
    service.on_identity(Arc::new(move |change| {
        if let Ok(mut changes) = sink.lock() {
            changes.push(change);
        }
    }));
    heard
}
