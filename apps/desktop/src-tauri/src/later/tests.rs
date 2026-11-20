//! Scheduling, a failed send kept with its reason, and reminders that go quietly once answered.

use std::sync::Arc;

use buun_mail_routing::Router;
use buun_mail_store::Store;

use super::service::LaterService;
use crate::mailbox::{Mailbox, unix_now};
use crate::paths::TEST_ROUTING;
use crate::send::{ContactInput, DraftDto, SendService};

fn setup() -> (tempfile::TempDir, Arc<Mailbox>, LaterService) {
    let folder = tempfile::tempdir().unwrap_or_else(|error| unreachable!("temp: {error}"));
    let router = Router::from_toml(TEST_ROUTING).unwrap_or_else(|error| unreachable!("routing: {error}"));
    let store = Store::open(&folder.path().join("store")).unwrap_or_else(|error| unreachable!("store: {error}"));
    let mailbox = Arc::new(Mailbox::new(router, store, folder.path().join("workspaces.toml")).unwrap_or_else(|error| unreachable!("mailbox: {error}")));
    let send = SendService::open(folder.path().join("config"), Arc::clone(&mailbox));
    let later = LaterService::new(folder.path().join("config"), &mailbox, send, None);
    (folder, mailbox, later)
}

fn draft() -> DraftDto {
    DraftDto {
        from: ContactInput { name: None, address: "hello@flung.dev".to_owned() },
        to: vec![ContactInput { name: None, address: "client@client.example".to_owned() }],
        cc: Vec::new(),
        bcc: Vec::new(),
        subject: "Quote".to_owned(),
        text: "Here it is".to_owned(),
        reply_to_message: None,
        attachments: Vec::new(),
    }
}

#[test]
fn schedules_refuses_the_past_and_keeps_a_failed_send_with_its_reason() {
    let (_folder, _mailbox, later) = setup();
    assert!(later.schedule(draft(), unix_now() - 10, None).is_err_and(|error| error.contains("passed")));
    let scheduled = later.schedule(draft(), unix_now() + 3600, Some(3)).unwrap_or_default();
    assert_eq!(scheduled.iter().map(|item| item.subject.as_str()).collect::<Vec<_>>(), vec!["Quote"]);
    // Due, but no sender covers flung.dev in this test: it stays, saying why, to be tried again.
    later.run_due(unix_now() + 7200);
    let kept = later.scheduled().unwrap_or_default();
    assert!(kept.first().is_some_and(|item| item.problem.as_deref().is_some_and(|problem| problem.contains("flung.dev"))));
    assert_eq!(later.cancel(&kept[0].id).map(|list| list.len()), Ok(0));
}

#[test]
fn a_reminder_goes_quietly_once_answered() {
    let (_folder, mailbox, later) = setup();
    let sent = mailbox.keep_sent(b"From: hello@flung.dev\r\nTo: client@client.example\r\nSubject: Quote\r\nMessage-ID: <q1@flung.dev>\r\nDate: Fri, 20 Nov 2026 10:00:00 +0000\r\n\r\nHere\r\n", "hello@flung.dev").unwrap_or_else(|error| unreachable!("sent: {error}"));
    assert_eq!(later.remind(&sent.id, 3).map(|list| list.len()), Ok(1));
    assert_eq!(mailbox.answered_since(&sent.id, 0).ok(), Some(false));
    let reply = format!(
        "From: client@client.example\r\nTo: hello@flung.dev\r\nSubject: Re: Quote\r\nMessage-ID: <r1@client.example>\r\nIn-Reply-To: <q1@flung.dev>\r\nDate: {}\r\n\r\nThanks\r\n",
        "Sat, 21 Nov 2099 10:00:00 +0000"
    );
    let _ = mailbox.take_in(reply.as_bytes(), "hello@flung.dev", unix_now());
    assert_eq!(mailbox.answered_since(&sent.id, 0).ok(), Some(true));
    later.run_due(unix_now() + 4 * 86_400);
    assert_eq!(later.reminders().map(|list| list.len()), Ok(0), "due reminders are cleared either way");
}
