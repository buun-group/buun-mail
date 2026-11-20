//! Each kind of alert against a fake service on this computer, the checks before a channel is saved, and a rule that
//! alerts when matching mail arrives.

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use buun_mail_routing::Router;
use buun_mail_rules::{Action, Rule, When};
use buun_mail_store::Store;

use super::AlertKind;
use super::service::AlertService;
use crate::mailbox::{Actor, Mailbox};
use crate::paths::TEST_ROUTING;
use crate::send::SendService;

/// What the fake service was asked: method, path and query, headers it cares about, body.
type Seen = Arc<Mutex<Vec<(String, String, String, String)>>>;

fn fake_service() -> (String, Seen) {
    let server = tiny_http::Server::http("127.0.0.1:0").unwrap_or_else(|error| unreachable!("listen: {error}"));
    let base = format!("http://127.0.0.1:{}", server.server_addr().to_ip().map_or(0, |address| address.port()));
    let seen: Seen = Arc::default();
    let log = Arc::clone(&seen);
    thread::spawn(move || {
        for mut request in server.incoming_requests() {
            let mut body = String::new();
            let _ = std::io::Read::read_to_string(request.as_reader(), &mut body);
            let headers = request
                .headers()
                .iter()
                .filter(|header| header.field.equiv("Title") || header.field.equiv("Authorization"))
                .map(|header| format!("{}={}", header.field, header.value))
                .collect::<Vec<_>>()
                .join(";");
            if let Ok(mut log) = log.lock() {
                log.push((request.method().to_string(), request.url().to_owned(), headers, body));
            }
            let _ = request.respond(tiny_http::Response::from_string("{}").with_status_code(200));
        }
    });
    (base, seen)
}

struct Setup {
    _folder: tempfile::TempDir,
    mailbox: Arc<Mailbox>,
    alerts: AlertService,
}

fn setup() -> Setup {
    let folder = tempfile::tempdir().unwrap_or_else(|error| unreachable!("temp: {error}"));
    let router = Router::from_toml(TEST_ROUTING).unwrap_or_else(|error| unreachable!("routing: {error}"));
    let store = Store::open(&folder.path().join("store")).unwrap_or_else(|error| unreachable!("store: {error}"));
    let mailbox = Arc::new(Mailbox::new(router, store, folder.path().join("workspaces.toml")).unwrap_or_else(|error| unreachable!("mailbox: {error}")));
    let send = SendService::open(folder.path().join("config"), Arc::clone(&mailbox));
    let alerts = AlertService::start(folder.path().join("config"), &mailbox, send);
    Setup { _folder: folder, mailbox, alerts }
}

fn fields(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
    pairs.iter().map(|(key, value)| ((*key).to_owned(), (*value).to_owned())).collect()
}

fn wait_for(seen: &Seen, count: usize) -> Vec<(String, String, String, String)> {
    let until = Instant::now() + Duration::from_secs(5);
    while Instant::now() < until {
        if let Ok(log) = seen.lock()
            && log.len() >= count
        {
            return log.clone();
        }
        thread::sleep(Duration::from_millis(20));
    }
    seen.lock().map(|log| log.clone()).unwrap_or_default()
}

#[test]
fn sends_each_kind_in_its_service_shape() {
    let setup = setup();
    let (base, seen) = fake_service();
    let added = [
        setup.alerts.add("Slack", AlertKind::Slack, BTreeMap::new(), &format!("{base}/slack/hook")),
        setup.alerts.add("Phone", AlertKind::Ntfy, fields(&[("server", &base)]), "gunspec-sales"),
        setup.alerts.add("Telegram", AlertKind::Telegram, fields(&[("chatId", "42"), ("apiBase", &base)]), "bot-token"),
        setup.alerts.add(
            "Text",
            AlertKind::Sms,
            fields(&[("accountSid", "AC1"), ("from", "+15550001"), ("to", "+15550002"), ("apiBase", &base)]),
            "auth-token",
        ),
    ];
    assert!(added.iter().all(Result::is_ok), "{added:?}");
    for id in ["alert-1", "alert-2", "alert-3", "alert-4"] {
        assert_eq!(setup.alerts.test(id), Ok(()));
    }
    let log = wait_for(&seen, 4);
    let json = |body: &str| serde_json::from_str::<serde_json::Value>(body).unwrap_or_default();
    assert_eq!(log[0].1, "/slack/hook");
    assert!(json(&log[0].3)["text"].as_str().is_some_and(|text| text.starts_with("New mail: This is a test alert")));
    assert!(log[1].1 == "/gunspec-sales" && log[1].2.eq_ignore_ascii_case("title=New mail: This is a test alert") && log[1].3.starts_with("From Buun Mail"));
    assert!(log[2].1 == "/botbot-token/sendMessage" && json(&log[2].3)["chat_id"] == "42");
    assert!(
        log[3].1 == "/2010-04-01/Accounts/AC1/Messages.json"
            && log[3].2.to_ascii_lowercase().starts_with("authorization=basic ")
            && log[3].3.contains("To=%2B15550002")
    );
    let listed = setup.alerts.list().unwrap_or_default();
    assert!(listed.iter().all(|channel| channel.sent == 1 && channel.problem.is_none()));
    assert!(listed.iter().filter(|channel| channel.kind != AlertKind::Email).all(|channel| channel.has_secret));
}

#[test]
fn refuses_a_channel_missing_what_it_needs_or_in_the_clear() {
    let setup = setup();
    assert!(setup.alerts.add("Slack", AlertKind::Slack, BTreeMap::new(), "").is_err_and(|error| error.contains("webhook")));
    assert!(setup.alerts.add("Slack", AlertKind::Slack, BTreeMap::new(), "http://hooks.example/x").is_err_and(|error| error.contains("https")));
    assert!(setup.alerts.add("Mail", AlertKind::Email, fields(&[("to", "me@example.com")]), "").is_err_and(|error| error.contains("sent from")));
    assert!(setup.alerts.add("Text", AlertKind::Sms, fields(&[("accountSid", "AC1")]), "token").is_err_and(|error| error.contains("number")));
}

#[test]
fn a_rule_alerts_when_matching_mail_arrives() {
    let setup = setup();
    let (base, seen) = fake_service();
    let _ = setup.alerts.add("GunSpec sales", AlertKind::Webhook, BTreeMap::new(), &format!("{base}/hook"));
    let rule = Rule::new(
        "GunSpec subscriptions",
        When { subject_contains: Some("subscription".to_owned()), ..When::default() },
        vec![Action::Alert { channel: "alert-1".to_owned() }],
    );
    setup.mailbox.save_rule(rule, &Actor::You).unwrap_or_else(|error| unreachable!("rule: {error}"));
    let raw = b"From: Stripe <receipts@stripe.com>\r\nTo: billing@gunspec.io\r\nSubject: New subscription: Pro plan\r\nMessage-ID: <s1@stripe.com>\r\n\r\nA customer subscribed.\r\n";
    let _ = setup.mailbox.take_in(raw, "billing@gunspec.io", 1_795_000_000);
    let other = b"From: a@b.example\r\nTo: billing@gunspec.io\r\nSubject: Hello\r\nMessage-ID: <h1@b.example>\r\n\r\nHi\r\n";
    let _ = setup.mailbox.take_in(other, "billing@gunspec.io", 1_795_000_001);
    let log = wait_for(&seen, 1);
    thread::sleep(Duration::from_millis(200));
    assert_eq!(seen.lock().map_or(0, |log| log.len()), 1, "only the matching mail alerts");
    let body = serde_json::from_str::<serde_json::Value>(&log[0].3).unwrap_or_default();
    assert_eq!(body["event"], "mail.arrived");
    assert_eq!(body["message"]["subject"], "New subscription: Pro plan");
}

#[test]
fn tagging_a_message_by_hand_alerts_through_its_rule() {
    let setup = setup();
    let (base, seen) = fake_service();
    let _ = setup.alerts.add("VIP", AlertKind::Webhook, BTreeMap::new(), &format!("{base}/vip"));
    let rule = Rule::new("VIP alert", When { tagged: Some("vip".to_owned()), ..When::default() }, vec![Action::Alert { channel: "alert-1".to_owned() }]);
    setup.mailbox.save_rule(rule, &Actor::You).unwrap_or_else(|error| unreachable!("rule: {error}"));
    let raw =
        b"From: Big Client <ceo@client.example>\r\nTo: hello@gunspec.io\r\nSubject: Partnership\r\nMessage-ID: <p1@client.example>\r\n\r\nLet us talk.\r\n";
    let id = setup.mailbox.take_in(raw, "hello@gunspec.io", 1_795_000_000).ok().flatten().map(|message| message.id).unwrap_or_default();
    thread::sleep(Duration::from_millis(150));
    assert_eq!(seen.lock().map_or(0, |log| log.len()), 0, "nothing until the tag is added");
    let _ = setup.mailbox.tag(&id, &["vip".to_owned()], &Actor::You);
    let log = wait_for(&seen, 1);
    let body = serde_json::from_str::<serde_json::Value>(&log.first().map(|entry| entry.3.clone()).unwrap_or_default()).unwrap_or_default();
    assert_eq!(body["message"]["subject"], "Partnership");
    let _ = setup.mailbox.tag(&id, &["vip".to_owned()], &Actor::You);
    thread::sleep(Duration::from_millis(150));
    assert_eq!(seen.lock().map_or(0, |log| log.len()), 1, "a tag already there does not alert again");
}
