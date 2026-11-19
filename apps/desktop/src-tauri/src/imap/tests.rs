//! The IMAP client and collection against a fake server on this computer, over plain text.

use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::sync::Arc;
use std::thread;

use buun_mail_routing::Router;
use buun_mail_store::Store;

use super::client::{ImapError, ImapSecurity, ImapSession};
use super::service::collect;
use super::settings::ImapAccount;
use crate::mailbox::Mailbox;
use crate::paths::TEST_ROUTING;

/// Three messages with UIDs 5, 6 and 7 in a folder whose UIDVALIDITY is 42; signs in only `me`/`secret`.
fn fake_server() -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap_or_else(|error| unreachable!("listen: {error}"));
    let port = listener.local_addr().map_or(0, |address| address.port());
    thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let mut writer = stream.try_clone().unwrap_or_else(|error| unreachable!("clone: {error}"));
            let mut reader = BufReader::new(stream);
            let _ = writer.write_all(b"* OK fake IMAP ready\r\n");
            let mut line = String::new();
            while reader.read_line(&mut line).is_ok_and(|read| read > 0) {
                let (tag, command) = line.trim_end().split_once(' ').unwrap_or(("*", ""));
                let reply = if command.starts_with("LOGIN") {
                    if command == "LOGIN \"me\" \"secret\"" {
                        format!("{tag} OK signed in\r\n")
                    } else {
                        format!("{tag} NO [AUTHENTICATIONFAILED] wrong password\r\n")
                    }
                } else if command.starts_with("EXAMINE") {
                    format!("* 3 EXISTS\r\n* OK [UIDVALIDITY 42] UIDs valid\r\n{tag} OK [READ-ONLY] done\r\n")
                } else if let Some(range) = command.strip_prefix("UID SEARCH UID ") {
                    let from: u32 = range.split(':').next().and_then(|value| value.parse().ok()).unwrap_or(1);
                    let found: Vec<String> = [5_u32, 6, 7].iter().filter(|uid| **uid >= from).map(ToString::to_string).collect();
                    // Like real servers, n:* past the end still returns the newest.
                    let found = if found.is_empty() { "7".to_owned() } else { found.join(" ") };
                    format!("* SEARCH {found}\r\n{tag} OK search done\r\n")
                } else if let Some(rest) = command.strip_prefix("UID FETCH ") {
                    let uid = rest.split(' ').next().unwrap_or("0");
                    let raw = format!(
                        "From: Sender {uid} <s{uid}@example.com>\r\nTo: hello@flung.dev\r\nSubject: Message {uid}\r\nMessage-ID: <m{uid}@example.com>\r\n\r\nBody {uid}\r\n"
                    );
                    format!("* 1 FETCH (UID {uid} BODY[] {{{}}}\r\n{raw})\r\n{tag} OK fetch done\r\n", raw.len())
                } else if command.starts_with("LOGOUT") {
                    let _ = writer.write_all(format!("* BYE\r\n{tag} OK bye\r\n").as_bytes());
                    break;
                } else {
                    format!("{tag} BAD unknown\r\n")
                };
                let _ = writer.write_all(reply.as_bytes());
                line.clear();
            }
        }
    });
    port
}

fn account(port: u16, last_uid: u32) -> ImapAccount {
    ImapAccount {
        id: "imap-1".to_owned(),
        name: "Test".to_owned(),
        host: "127.0.0.1".to_owned(),
        port,
        security: ImapSecurity::None,
        username: "me".to_owned(),
        password: "secret".to_owned(),
        folder: "INBOX".to_owned(),
        uid_validity: 42,
        last_uid,
    }
}

fn mailbox() -> (tempfile::TempDir, Arc<Mailbox>) {
    let folder = tempfile::tempdir().unwrap_or_else(|error| unreachable!("temp: {error}"));
    let router = Router::from_toml(TEST_ROUTING).unwrap_or_else(|error| unreachable!("routing: {error}"));
    let store = Store::open(&folder.path().join("store")).unwrap_or_else(|error| unreachable!("store: {error}"));
    let mailbox = Arc::new(Mailbox::new(router, store, folder.path().join("workspaces.toml")).unwrap_or_else(|error| unreachable!("mailbox: {error}")));
    (folder, mailbox)
}

#[test]
fn signs_in_lists_and_fetches_with_literals() {
    let port = fake_server();
    let mut session = ImapSession::connect("127.0.0.1", port, ImapSecurity::None).unwrap_or_else(|error| unreachable!("connect: {error}"));
    session.login("me", "secret").unwrap_or_else(|error| unreachable!("login: {error}"));
    let opened = session.examine("INBOX").unwrap_or_else(|error| unreachable!("examine: {error}"));
    assert_eq!((opened.uid_validity, opened.exists), (42, 3));
    assert_eq!(session.uids_after(5), Ok(vec![6, 7]));
    assert_eq!(session.uids_after(7), Ok(Vec::new()));
    let raw = session.fetch(6).ok().flatten().unwrap_or_default();
    assert!(String::from_utf8_lossy(&raw).contains("Subject: Message 6"));
    session.logout();
}

#[test]
fn refuses_a_wrong_password_and_plain_text_elsewhere() {
    let port = fake_server();
    let mut session = ImapSession::connect("127.0.0.1", port, ImapSecurity::None).unwrap_or_else(|error| unreachable!("connect: {error}"));
    assert!(matches!(session.login("me", "nope"), Err(ImapError::SignIn(said)) if said.contains("wrong password")));
    assert!(matches!(ImapSession::connect("imap.example.com", 143, ImapSecurity::None), Err(ImapError::SignIn(_))));
}

#[test]
fn collects_only_what_is_new_and_files_it_by_its_recipient() {
    let port = fake_server();
    let (_folder, mailbox) = mailbox();
    let (validity, last, arrived) = collect(&account(port, 5), &mailbox).unwrap_or_else(|error| unreachable!("collect: {error}"));
    assert_eq!((validity, last), (42, 7));
    assert_eq!(arrived.iter().map(|message| message.subject.as_str()).collect::<Vec<_>>(), vec!["Message 6", "Message 7"]);
    assert!(arrived.iter().all(|message| message.workspace == "flung"));
    let (_, again, nothing) = collect(&account(port, 7), &mailbox).unwrap_or_else(|error| unreachable!("collect: {error}"));
    assert_eq!((again, nothing.len()), (7, 0));
}

#[test]
fn starts_over_when_the_server_renumbers() {
    let port = fake_server();
    let (_folder, mailbox) = mailbox();
    let mut stale = account(port, 99);
    stale.uid_validity = 1;
    let (_, last, arrived) = collect(&stale, &mailbox).unwrap_or_else(|error| unreachable!("collect: {error}"));
    assert_eq!((last, arrived.len()), (7, 3));
}
