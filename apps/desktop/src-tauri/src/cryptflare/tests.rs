//! The `CryptFlare` integration against a fake server on this computer: signing in for the REST API, choosing where
//! saves go, saving an identity (new, a new version, metadata only, ended), retrying while the server is down,
//! stopping on a refusal, refreshing once, and signing out.

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};
use std::thread;

use serde_json::{Value, json};

use super::service::{CryptFlareService, TargetDto};
use super::settings;
use crate::dissolve::{IdentityChange, IdentityRecord};

#[derive(Default)]
struct Fake {
    /// The access token accepted now.
    accepted: String,
    /// The refresh token that works now; any other is refused.
    refresh: String,
    /// Refreshes asked for.
    refreshes: usize,
    /// Secrets by key: (value, versions, metadata).
    secrets: BTreeMap<String, (String, u32, Value)>,
    /// Every write, as (method, last path segment).
    writes: Vec<(String, String)>,
    /// Answer every secret call with this status instead.
    fail: Option<u16>,
    /// The `resource` the code exchange carried.
    resource: Option<String>,
    /// Refresh tokens handed back.
    revoked: Vec<String>,
}

fn json_response(status: u16, value: &Value) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    tiny_http::Response::from_string(value.to_string())
        .with_status_code(status)
        .with_header(tiny_http::Header::from_bytes("Content-Type", "application/json").unwrap_or_else(|()| unreachable!()))
}

fn field(body: &str, name: &str) -> Option<String> {
    body.split('&').find_map(|pair| pair.strip_prefix(&format!("{name}="))).map(|value| value.replace("%3A", ":").replace("%2F", "/"))
}

fn secret_route(fake: &mut Fake, method: &str, path: &[&str], body: &str) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    if let Some(status) = fake.fail {
        return json_response(status, &json!({ "code": "RBAC_FORBIDDEN", "detail": "This token may not write to that workspace." }));
    }
    let asked: Value = serde_json::from_str(body).unwrap_or(Value::Null);
    match (method, path) {
        ("POST", ["v1", "organisations", "org_1", "workspaces", "ws_1", "environments", "env_1", "secrets"]) => {
            let key = asked["key"].as_str().unwrap_or_default().to_owned();
            fake.writes.push(("POST".to_owned(), key.clone()));
            if fake.secrets.contains_key(&key) {
                return json_response(409, &json!({ "code": "CONFLICT", "detail": "Secret already exists" }));
            }
            fake.secrets.insert(key.clone(), (asked["value"].as_str().unwrap_or_default().to_owned(), 1, asked["metadata"].clone()));
            json_response(201, &json!({ "data": { "key": key } }))
        }
        ("POST", ["v1", "organisations", "org_1", "workspaces", "ws_1", "environments", "env_1", "secrets", key, "rotate"]) => {
            fake.writes.push(("rotate".to_owned(), (*key).to_owned()));
            match fake.secrets.get_mut(*key) {
                Some(secret) => {
                    secret.0 = asked["value"].as_str().unwrap_or_default().to_owned();
                    secret.1 += 1;
                    json_response(200, &json!({ "key": key, "version": secret.1 }))
                }
                None => json_response(404, &json!({ "detail": "Secret not found" })),
            }
        }
        ("PATCH", ["v1", "organisations", "org_1", "workspaces", "ws_1", "environments", "env_1", "secrets", key, "settings"]) => {
            fake.writes.push(("settings".to_owned(), (*key).to_owned()));
            match fake.secrets.get_mut(*key) {
                Some(secret) => {
                    secret.2 = asked["metadata"].clone();
                    json_response(200, &json!({ "data": {} }))
                }
                None => json_response(404, &json!({ "detail": "Secret not found" })),
            }
        }
        _ => json_response(404, &json!({ "detail": "Not found" })),
    }
}

fn fake_server() -> (String, Arc<Mutex<Fake>>) {
    let server = tiny_http::Server::http("127.0.0.1:0").unwrap_or_else(|error| unreachable!("listen: {error}"));
    let base = format!("http://127.0.0.1:{}", server.server_addr().to_ip().map_or(0, |address| address.port()));
    let state = Arc::new(Mutex::new(Fake { accepted: "at-1".to_owned(), refresh: "rt-1".to_owned(), ..Fake::default() }));
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
                ("GET", [".well-known", "oauth-authorization-server"]) => json_response(
                    200,
                    &json!({ "issuer": issuer, "authorization_endpoint": format!("{issuer}/oauth/authorize"), "token_endpoint": format!("{issuer}/oauth/token"), "registration_endpoint": format!("{issuer}/oauth/register"), "revocation_endpoint": format!("{issuer}/oauth/revoke") }),
                ),
                ("POST", ["oauth", "register"]) => json_response(201, &json!({ "client_id": "cfc_test" })),
                ("POST", ["oauth", "token"]) if body.contains("grant_type=authorization_code") && body.contains("code=code-1") => {
                    fake.resource = field(&body, "resource");
                    json_response(
                        200,
                        &json!({ "access_token": "at-1", "refresh_token": "rt-1", "expires_in": 3600, "scope": "secrets:list secrets:write workspaces:read environments:read" }),
                    )
                }
                ("POST", ["oauth", "token"]) if body.contains("grant_type=refresh_token") => {
                    fake.refreshes += 1;
                    if field(&body, "refresh_token").as_deref() == Some(fake.refresh.as_str()) {
                        let next = fake.refreshes + 1;
                        fake.accepted = format!("at-{next}");
                        fake.refresh = format!("rt-{next}");
                        json_response(200, &json!({ "access_token": fake.accepted, "refresh_token": fake.refresh, "expires_in": 3600 }))
                    } else {
                        json_response(400, &json!({ "error": "invalid_grant", "error_description": "That refresh token was already used." }))
                    }
                }
                ("POST", ["oauth", "revoke"]) => {
                    if let Some(token) = field(&body, "token") {
                        fake.revoked.push(token);
                    }
                    json_response(200, &json!({}))
                }
                _ if !authorized => json_response(401, &json!({ "detail": "Unauthorized" })),
                ("GET", ["v1", "auth", "whoami"]) => {
                    json_response(200, &json!({ "orgId": "org_1", "organisation": { "id": "org_1", "name": "Buun Group", "plan": "pro" } }))
                }
                ("GET", ["v1", "organisations", "org_1", "workspaces"]) => {
                    json_response(200, &json!({ "data": [{ "id": "ws_1", "name": "Agents", "slug": "agents" }] }))
                }
                ("GET", ["v1", "organisations", "org_1", "workspaces", "ws_1", "environments"]) => {
                    json_response(200, &json!({ "data": [{ "id": "env_1", "name": "Identities", "slug": "identities" }] }))
                }
                _ => secret_route(&mut fake, &method, &path, &body),
            };
            drop(fake);
            let _ = request.respond(response);
        }
    });
    (base, state)
}

/// What opens the browser.
type Browser = Box<dyn Fn(&str) -> Result<(), String> + Send + Sync>;

/// A browser that approves at once: it follows the authorize address back to the loopback redirect.
fn browser(issuer: String) -> Browser {
    Box::new(move |url: &str| {
        let query = url.split_once('?').map_or("", |(_, query)| query).to_owned();
        let field = |name: &str| query.split('&').find_map(|pair| pair.strip_prefix(&format!("{name}="))).unwrap_or("").to_owned();
        let redirect = field("redirect_uri").replace("%3A", ":").replace("%2F", "/");
        let back = format!("{redirect}?code=code-1&state={}&iss={}", field("state"), issuer);
        thread::spawn(move || {
            let _ = ureq::get(&back).call();
        });
        Ok(())
    })
}

struct Setup {
    folder: tempfile::TempDir,
    fake: Arc<Mutex<Fake>>,
    service: CryptFlareService,
}

/// Connected, with Agents / Identities chosen and saving on.
fn setup() -> Setup {
    let folder = tempfile::tempdir().unwrap_or_else(|error| unreachable!("temp: {error}"));
    let (base, fake) = fake_server();
    let service = CryptFlareService::new(folder.path().to_path_buf(), browser(base.clone()));
    let status = service.connect(Some(&base), Some(&base)).unwrap_or_else(|error| unreachable!("connect: {error}"));
    assert!(status.connected && status.can_write);
    assert_eq!(status.organisation.as_deref(), Some("Buun Group"));
    let workspace = service.workspaces().unwrap_or_default().into_iter().next().unwrap_or_else(|| unreachable!("a workspace"));
    let environment = service.environments(&workspace.id).unwrap_or_default().into_iter().next().unwrap_or_else(|| unreachable!("an environment"));
    let target = TargetDto { workspace_id: workspace.id, workspace_name: workspace.name, environment_id: environment.id, environment_name: environment.name };
    service.set_target(target).unwrap_or_else(|error| unreachable!("target: {error}"));
    service.set_save_identities(true).unwrap_or_else(|error| unreachable!("switch: {error}"));
    Setup { folder, fake, service }
}

fn record(password: Option<&str>) -> IdentityRecord {
    IdentityRecord {
        identity_id: "idn_1".to_owned(),
        inbox_id: Some("inb_1".to_owned()),
        email: "ada@shop.example".to_owned(),
        password: password.map(str::to_owned),
        persona: Some(json!({ "fullName": "Ada Example", "phone": "07700 900123" })),
        label: None,
        expires_at: Some("2026-12-01T00:00:00Z".to_owned()),
    }
}

const KEY: &str = "DISSOLVE_ADA_SHOP_EXAMPLE";

fn secret(setup: &Setup) -> Option<(String, u32, Value)> {
    setup.fake.lock().ok()?.secrets.get(KEY).cloned()
}

#[test]
fn signs_in_for_the_rest_api_and_keeps_the_tokens_sealed() {
    let setup = setup();
    let resource = setup.fake.lock().ok().and_then(|fake| fake.resource.clone());
    assert!(resource.is_some_and(|resource| resource.starts_with("http://127.0.0.1")), "the token is asked for the REST API");
    let text = std::fs::read_to_string(setup.folder.path().join("cryptflare.json")).unwrap_or_default();
    assert!(!text.contains("at-1") && !text.contains("rt-1") && !text.contains("cfc_test"), "{text}");
    let saved = settings::load(setup.folder.path());
    assert_eq!(saved.account.map(|account| account.refresh_token), Some("rt-1".to_owned()));
}

#[test]
fn saves_an_identity_then_a_new_password_as_a_new_version_then_its_metadata() {
    let setup = setup();
    setup.service.identity_changed(&IdentityChange::Saved(record(Some("pw-1"))));
    assert_eq!(setup.service.flush(false), Ok(1));
    let Some((value, version, metadata)) = secret(&setup) else { unreachable!("saved") };
    assert!(value.contains("pw-1") && value.contains("Ada Example") && version == 1);
    assert!(!metadata.to_string().contains("Ada"), "the persona stays out of the unencrypted metadata: {metadata}");

    setup.service.identity_changed(&IdentityChange::Saved(record(Some("pw-2"))));
    assert_eq!(setup.service.flush(false), Ok(1));
    assert!(secret(&setup).is_some_and(|(value, version, _)| value.contains("pw-2") && version == 2), "409 becomes a new version");

    let mut renamed = record(None);
    renamed.label = Some("GitHub".to_owned());
    setup.service.identity_changed(&IdentityChange::Updated(renamed));
    setup.service.identity_changed(&IdentityChange::Ended { identity_id: Some("idn_1".to_owned()), email: "ada@shop.example".to_owned() });
    assert_eq!(setup.service.flush(false), Ok(1), "the rename and the end are one save of the same key");
    let Some((value, version, metadata)) = secret(&setup) else { unreachable!("saved") };
    assert!(value.contains("pw-2") && version == 2, "metadata changes never touch the value");
    assert!(metadata["ended"].is_string() && metadata["inboxId"] == "inb_1", "{metadata}");
    assert!(setup.service.status().is_ok_and(|status| status.pending == 0 && status.last_saved.is_some()));
}

#[test]
fn keeps_a_save_while_cryptflare_is_down_and_writes_it_later() {
    let setup = setup();
    if let Ok(mut fake) = setup.fake.lock() {
        fake.fail = Some(503);
    }
    setup.service.identity_changed(&IdentityChange::Saved(record(Some("pw-1"))));
    assert_eq!(setup.service.flush(false), Ok(0));
    let waiting = settings::load(setup.folder.path());
    assert!(waiting.pending.get(KEY).is_some_and(|save| save.attempts == 1 && save.next_at > crate::mailbox::unix_now()));
    let text = std::fs::read_to_string(setup.folder.path().join("cryptflare.json")).unwrap_or_default();
    assert!(!text.contains("pw-1"), "a waiting password is sealed on disk");
    assert_eq!(setup.service.flush(false), Ok(0), "not due yet");

    if let Ok(mut fake) = setup.fake.lock() {
        fake.fail = None;
    }
    assert_eq!(setup.service.flush(true), Ok(1));
    assert!(secret(&setup).is_some());
}

#[test]
fn stops_on_a_refusal_without_retrying_every_save() {
    let setup = setup();
    if let Ok(mut fake) = setup.fake.lock() {
        fake.fail = Some(403);
    }
    setup.service.identity_changed(&IdentityChange::Saved(record(Some("pw-1"))));
    let mut other = record(Some("pw-9"));
    other.email = "bob@shop.example".to_owned();
    setup.service.identity_changed(&IdentityChange::Saved(other));
    let outcome = setup.service.flush(false);
    assert!(outcome.is_err_and(|words| words.contains("may not write")));
    assert_eq!(setup.fake.lock().map(|fake| fake.writes.len()).unwrap_or_default(), 0, "a 403 is answered before any write lands");
    assert!(setup.service.status().is_ok_and(|status| status.pending == 2 && status.problem.is_some()));
}

#[test]
fn refreshes_once_even_when_two_saves_race_and_keeps_the_new_refresh_token() {
    let setup = setup();
    let mut saved = settings::load(setup.folder.path());
    if let Some(account) = saved.account.as_mut() {
        account.expires_at = 0;
    }
    settings::save(setup.folder.path(), &saved).unwrap_or_else(|error| unreachable!("{error}"));
    let service = CryptFlareService::new(setup.folder.path().to_path_buf(), Box::new(|_| Ok(())));
    service.identity_changed(&IdentityChange::Saved(record(Some("pw-1"))));
    let racing = service.clone();
    let other = thread::spawn(move || racing.workspaces());
    let flushed = service.flush(false);
    assert!(other.join().is_ok_and(|listed| listed.is_ok()));
    assert_eq!(flushed, Ok(1));
    assert_eq!(setup.fake.lock().map(|fake| fake.refreshes).unwrap_or_default(), 1, "a refresh token works once, so only one refresh");
    assert_eq!(settings::load(setup.folder.path()).account.map(|account| account.refresh_token), Some("rt-2".to_owned()));
}

#[test]
fn a_sign_in_whose_tab_was_closed_can_be_opened_again_copied_or_cancelled() {
    let folder = tempfile::tempdir().unwrap_or_else(|error| unreachable!("temp: {error}"));
    let (base, _fake) = fake_server();
    let opened = Arc::new(Mutex::new(Vec::<String>::new()));
    let seen = Arc::clone(&opened);
    // A browser whose tab is closed at once: it never comes back.
    let service = CryptFlareService::new(
        folder.path().to_path_buf(),
        Box::new(move |url: &str| {
            if let Ok(mut urls) = seen.lock() {
                urls.push(url.to_owned());
            }
            Ok(())
        }),
    );
    assert_eq!(service.sign_in_link(), None);
    let connecting = service.clone();
    let waiting = thread::spawn(move || connecting.connect(Some(&base), Some(&base)));

    let link = (0..100).find_map(|_| {
        service.sign_in_link().or_else(|| {
            thread::sleep(std::time::Duration::from_millis(20));
            None
        })
    });
    let Some(link) = link else { unreachable!("no link while waiting") };
    assert!(link.contains("/oauth/authorize?") && link.contains("code_challenge_method=S256") && link.contains("resource="), "{link}");

    assert_eq!(service.reopen_sign_in(), Ok(()));
    assert_eq!(opened.lock().map(|urls| urls.clone()).unwrap_or_default(), vec![link.clone(), link]);

    service.cancel_sign_in();
    let outcome = waiting.join().unwrap_or_else(|_| unreachable!("the sign-in thread"));
    assert_eq!(outcome.err().as_deref(), Some("sign-in cancelled"));
    assert_eq!(service.sign_in_link(), None, "nothing waits once it ended");
    assert!(service.reopen_sign_in().is_err());
}

#[test]
fn saves_nothing_while_off_and_signing_out_hands_the_token_back_and_drops_waiting_saves() {
    let setup = setup();
    setup.service.set_save_identities(false).unwrap_or_else(|error| unreachable!("{error}"));
    setup.service.identity_changed(&IdentityChange::Saved(record(Some("pw-1"))));
    assert!(setup.service.status().is_ok_and(|status| status.pending == 0));

    assert_eq!(setup.service.save_identities_now(vec![record(Some("pw-1")), record(None)]), Ok(1), "only identities with a password can be saved");
    let status = setup.service.disconnect().unwrap_or_else(|error| unreachable!("{error}"));
    assert!(!status.connected && status.pending == 0 && !status.save_identities);
    assert_eq!(setup.fake.lock().map(|fake| fake.revoked.clone()).unwrap_or_default(), vec!["rt-1".to_owned()]);
}
