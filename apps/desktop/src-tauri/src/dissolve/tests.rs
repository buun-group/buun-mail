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
use super::{WORKSPACE, settings};
use crate::mailbox::Mailbox;
use crate::paths::TEST_ROUTING;

#[derive(Default)]
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
            let response = match (method.as_str(), path.as_slice()) {
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
                ("POST", ["v1", "inboxes"]) => {
                    let id = format!("inb_{}", fake.inboxes.len() + 1);
                    let address = format!("new{}@dissolve.test", fake.inboxes.len() + 1);
                    fake.inboxes.insert(id.clone(), (address.clone(), "2026-12-01T00:00:00.000Z".to_owned()));
                    json_response(201, &json!({ "id": id, "address": address, "customName": "Shop", "expiresAt": "2026-12-01T00:00:00.000Z" }))
                }
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
    let status = service.connect(Some(&setup.base)).unwrap_or_else(|error| unreachable!("connect: {error}"));
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
    let made = service.create_inbox(None, Some("Shop")).unwrap_or_else(|error| unreachable!("create: {error}"));
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
    assert_eq!(declined.connect(Some(&setup.base)).err().as_deref(), Some("you declined in the browser"));
    let forged = DissolveService::new(setup.config.clone(), Arc::clone(&setup.mailbox), None, browser("https://evil.example".to_owned(), "code=code-1"));
    assert!(forged.connect(Some(&setup.base)).is_err_and(|error| error.contains("did not match")));
    assert!(declined.connect(Some("http://dissolve.example")).is_err_and(|error| error.contains("https")));
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
    assert_eq!(service.create_inbox(None, None).err().as_deref(), Some("You've reached your limit of 5 new inboxes an hour on the free plan."));
    let hourly = service.status().map(|status| status.limits.hourly_creations).unwrap_or_default();
    assert_eq!((hourly.used, hourly.limit, hourly.reset_at.as_deref()), (Some(5), Some(5), Some("2099-01-01T00:00:00.000Z")));

    assert_eq!(service.extend_inbox("inb_a").err().as_deref(), Some("The free plan allows 1 extension."));
    let extensions = service.status().ok().and_then(|status| status.inboxes.into_iter().find(|inbox| inbox.id == "inb_a")).and_then(|inbox| inbox.extensions);
    assert_eq!(extensions.map(|found| (found.used, found.limit, found.can_extend)), Some((Some(1), Some(1), Some(false))));
}
