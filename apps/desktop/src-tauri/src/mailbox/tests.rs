use std::fs;
use std::path::PathBuf;

use buun_mail_routing::{Router, UNSORTED_WORKSPACE};
use buun_mail_rules::{Action, Rule, When};
use buun_mail_store::{Placement, Store};

use super::{Actor, Mailbox};
use crate::error::AppError;
use crate::paths::EXAMPLE_ROUTING;

const STRIPE: &str = "From: Stripe <receipts@stripe.com>\r\nDelivered-To: me@personal.example\r\nTo: me@personal.example\r\nSubject: Your receipt\r\nDate: Tue, 17 Nov 2026 09:12:00 +0000\r\n\r\nReceipt 2041.\r\n";
const CLIENT: &str = "From: A client <projects@client.example>\r\nTo: hello@buungroup.com\r\nSubject: Quote\r\nDate: Wed, 18 Nov 2026 23:05:00 +0000\r\n\r\nCould you send the quote?\r\n";
const STRANGER: &str = "From: news@letters.example\r\nTo: old@forwarded.example\r\nSubject: News\r\n\r\nHi.\r\n";

fn mailbox() -> (tempfile::TempDir, Mailbox) {
    let folder = tempfile::tempdir().unwrap_or_else(|error| unreachable!("temp folder: {error}"));
    let router = Router::from_toml(EXAMPLE_ROUTING).unwrap_or_else(|error| unreachable!("example routing: {error}"));
    let store = Store::open(&folder.path().join("store")).unwrap_or_else(|error| unreachable!("store: {error}"));
    let mailbox = Mailbox::new(router, store, folder.path().join("workspaces.toml")).unwrap_or_else(|error| unreachable!("mailbox: {error}"));
    (folder, mailbox)
}

fn file(folder: &tempfile::TempDir, name: &str, contents: &str) -> PathBuf {
    let path = folder.path().join(name);
    fs::write(&path, contents).unwrap_or_else(|error| unreachable!("fixture file: {error}"));
    path
}

fn placement(workspace: &str, folder: Option<&str>) -> Placement {
    Placement { workspace: workspace.to_owned(), folder: folder.map(str::to_owned) }
}

#[test]
fn imports_and_routes_eml_files_once() -> Result<(), AppError> {
    let (folder, mailbox) = mailbox();
    let files = [file(&folder, "stripe.eml", STRIPE), file(&folder, "client.eml", CLIENT)];
    let (first, arrived) = mailbox.import_files(&files)?;
    assert_eq!(arrived.len(), 2);
    assert_eq!((first.added, first.duplicates), (2, 0));
    let (again, arrived) = mailbox.import_files(&files)?;
    assert_eq!(arrived, []);
    assert_eq!((again.added, again.duplicates), (0, 2));

    let receipts = mailbox.messages(&placement("personal", Some("Receipts")))?;
    assert_eq!(receipts.len(), 1);
    assert_eq!(receipts.first().map(|message| message.folder_matched.as_deref()), Some(Some("*@stripe.com")));
    assert_eq!(mailbox.messages(&placement("buun", None))?.len(), 1);
    Ok(())
}

#[test]
fn splits_an_mbox_and_reports_what_failed() -> Result<(), AppError> {
    let (folder, mailbox) = mailbox();
    let mbox = format!("From a Thu Nov 19 07:42:00 2026\n{}\nFrom b Thu Nov 19 07:43:00 2026\nSubject: no sender\n\nx\n", CLIENT.replace("\r\n", "\n"));
    let (report, _) = mailbox.import_files(&[file(&folder, "export.mbox", &mbox), folder.path().join("missing.eml")])?;
    assert_eq!(report.added, 1);
    let sources: Vec<_> = report.failed.iter().map(|failure| failure.source.as_str()).collect();
    assert_eq!(sources, ["export.mbox, message 2", "missing.eml"]);
    Ok(())
}

#[test]
fn shows_unsorted_only_once_it_holds_mail() -> Result<(), AppError> {
    let (folder, mailbox) = mailbox();
    assert!(mailbox.workspaces()?.iter().all(|workspace| workspace.id != UNSORTED_WORKSPACE));
    mailbox.import_files(&[file(&folder, "stranger.eml", STRANGER)])?;
    let workspaces = mailbox.workspaces()?;
    let unsorted = workspaces.iter().find(|workspace| workspace.id == UNSORTED_WORKSPACE);
    assert_eq!(unsorted.map(|workspace| workspace.unread), Some(1));
    Ok(())
}

#[test]
fn opening_a_message_reads_its_body_and_marks_it_read() -> Result<(), AppError> {
    let (folder, mailbox) = mailbox();
    mailbox.import_files(&[file(&folder, "client.eml", CLIENT)])?;
    let id = mailbox.messages(&placement("buun", None))?.first().map(|message| message.id.clone()).unwrap_or_default();
    let detail = mailbox.open_message(&id)?;
    assert_eq!(detail.body, "Could you send the quote?");
    assert!(!detail.message.unread);
    assert_eq!(mailbox.workspaces()?.iter().map(|workspace| workspace.unread).sum::<u32>(), 0);
    Ok(())
}

#[test]
fn marks_a_workspace_read() -> Result<(), AppError> {
    let (folder, mailbox) = mailbox();
    mailbox.import_files(&[file(&folder, "client.eml", CLIENT)])?;
    assert_eq!(mailbox.mark_all_read(&placement("buun", None), true, &Actor::You)?, 1);
    Ok(())
}

#[test]
fn rules_tag_move_and_quiet_mail_as_it_arrives() -> Result<(), AppError> {
    let (folder, mailbox) = mailbox();
    let rule = Rule::new(
        "Client quotes",
        When { subject_contains: Some("quote".to_owned()), ..When::default() },
        vec![Action::Tag { tag: "sales".to_owned() }, Action::Move { workspace: None, folder: Some("Sales".to_owned()) }, Action::Quiet],
    );
    let saved = mailbox.save_rule(rule, &Actor::Agent("claude".to_owned()))?;
    assert!(saved.id.starts_with("rule-"), "{}", saved.id);

    let (_, arrived) = mailbox.import_files(&[file(&folder, "client.eml", CLIENT)])?;
    assert_eq!(arrived, [], "a quiet rule keeps it out of notifications");
    let sales = mailbox.messages(&placement("buun", Some("Sales")))?;
    assert_eq!(sales.first().map(|message| message.tags.clone()), Some(vec!["sales".to_owned()]));
    assert!(mailbox.activity(10)?.iter().any(|entry| entry.actor == "agent:claude" && entry.action == "save_rule"));
    Ok(())
}

#[test]
fn re_runs_rules_over_stored_mail() -> Result<(), AppError> {
    let (folder, mailbox) = mailbox();
    mailbox.import_files(&[file(&folder, "stripe.eml", STRIPE), file(&folder, "client.eml", CLIENT)])?;
    mailbox.save_rule(
        Rule::new("Stripe", When { from: Some("*@stripe.com".to_owned()), ..When::default() }, vec![Action::Tag { tag: "money".to_owned() }, Action::MarkRead]),
        &Actor::You,
    )?;
    assert_eq!(mailbox.apply_rules_to_stored(&Actor::You)?, 1);
    assert_eq!(mailbox.apply_rules_to_stored(&Actor::You)?, 0, "running again changes nothing");
    let found = mailbox.search("money", None, false, 10)?;
    assert_eq!(found.len(), 1);
    assert_eq!(found.first().map(|message| message.unread), Some(false));
    Ok(())
}

#[test]
fn tags_moves_and_logs_who_did_it() -> Result<(), AppError> {
    let (folder, mailbox) = mailbox();
    mailbox.import_files(&[file(&folder, "client.eml", CLIENT)])?;
    let id = mailbox.messages(&placement("buun", None))?.first().map(|message| message.id.clone()).unwrap_or_default();
    let agent = Actor::Agent("cursor".to_owned());
    assert_eq!(mailbox.tag(&id, &["follow-up".to_owned()], &agent)?.tags, ["follow-up"]);
    mailbox.move_message(&id, &placement("personal", None), &agent)?;
    assert_eq!(mailbox.messages(&placement("personal", None))?.len(), 1);
    assert_eq!(mailbox.untag(&id, "follow-up", &Actor::You)?.tags, Vec::<String>::new());
    let actions: Vec<_> = mailbox.activity(10)?.into_iter().map(|entry| entry.action).collect();
    assert_eq!(actions, ["untag", "move", "tag"]);
    Ok(())
}

#[test]
fn refuses_a_rule_that_matches_everything() {
    let (_folder, mailbox) = mailbox();
    assert!(mailbox.save_rule(Rule::new("All", When::default(), vec![Action::MarkRead]), &Actor::You).is_err());
}
