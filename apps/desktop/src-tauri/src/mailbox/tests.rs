use std::fs;
use std::path::PathBuf;

use buun_mail_routing::{Router, UNSORTED_WORKSPACE};
use buun_mail_rules::{Action, Rule, When};
use buun_mail_store::{Placement, Store};

use super::{Actor, Mailbox};
use crate::error::AppError;
use crate::paths::TEST_ROUTING;

const STRIPE: &str = "From: Stripe <receipts@stripe.com>\r\nDelivered-To: me@personal.example\r\nTo: me@personal.example\r\nSubject: Your receipt\r\nDate: Tue, 17 Nov 2026 09:12:00 +0000\r\n\r\nReceipt 2041.\r\n";
const CLIENT: &str = "From: A client <projects@client.example>\r\nTo: hello@buungroup.com\r\nSubject: Quote\r\nDate: Wed, 18 Nov 2026 23:05:00 +0000\r\n\r\nCould you send the quote?\r\n";
const STRANGER: &str = "From: news@letters.example\r\nTo: old@forwarded.example\r\nSubject: News\r\n\r\nHi.\r\n";

fn mailbox() -> (tempfile::TempDir, Mailbox) {
    let folder = tempfile::tempdir().unwrap_or_else(|error| unreachable!("temp folder: {error}"));
    let router = Router::from_toml(TEST_ROUTING).unwrap_or_else(|error| unreachable!("example routing: {error}"));
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

#[test]
fn adds_a_workspace_for_a_new_domain_once_and_reloads() -> Result<(), AppError> {
    let folder = tempfile::tempdir().unwrap_or_else(|error| unreachable!("temp folder: {error}"));
    let routing = folder.path().join("workspaces.toml");
    fs::write(&routing, TEST_ROUTING).unwrap_or_else(|error| unreachable!("routing file: {error}"));
    let store = Store::open(&folder.path().join("store")).unwrap_or_else(|error| unreachable!("store: {error}"));
    let mailbox = Mailbox::new(Router::from_toml(TEST_ROUTING)?, store, routing.clone())?;

    assert!(mailbox.ensure_workspace_for("newbiz.example", "New business", &Actor::You)?);
    assert!(!mailbox.ensure_workspace_for("newbiz.example", "Again", &Actor::You)?, "a domain already claimed is left alone");
    assert!(!mailbox.ensure_workspace_for("buungroup.com", "Buun", &Actor::You)?, "the test file already claims it");
    let text = fs::read_to_string(&routing).unwrap_or_default();
    assert!(text.starts_with("# The routing file the Rust tests run against"), "the file's own comments survive");
    assert!(mailbox.workspaces()?.iter().any(|workspace| workspace.id == "newbiz-example" && workspace.name == "New business"));
    Ok(())
}

#[test]
fn a_new_install_starts_from_a_generic_example() -> Result<(), AppError> {
    let router = Router::from_toml(crate::paths::EXAMPLE_ROUTING)?;
    let ids: Vec<&str> = router.workspaces().map(|workspace| workspace.id().as_str()).filter(|id| *id != UNSORTED_WORKSPACE).collect();
    assert_eq!(ids, ["personal"], "a fresh install starts with one workspace");
    let addresses: Vec<String> = router.workspaces().flat_map(|workspace| workspace.patterns().iter().map(ToString::to_string).collect::<Vec<_>>()).collect();
    assert!(addresses.iter().all(|address| address.ends_with(".example")), "only reserved example domains: {addresses:?}");
    Ok(())
}

#[test]
fn keeps_each_message_size_and_sender_checks_and_catches_up_older_mail() -> Result<(), AppError> {
    let (_folder, mailbox) = mailbox();
    let raw = b"Authentication-Results: mx.example; spf=pass; dkim=pass; dmarc=fail\r\nFrom: a@shop.example\r\nTo: hello@acme.example\r\nSubject: Code\r\nMessage-ID: <c1@shop.example>\r\n\r\nYour code is 1234\r\n";
    let taken = mailbox.take_in(raw, "hello@flung.dev", 1_795_000_000)?.unwrap_or_else(|| unreachable!("new mail"));
    assert_eq!(taken.size, i64::try_from(raw.len()).ok());
    assert_eq!(taken.checks.as_ref().map(|checks| (checks.spf, checks.dkim, checks.dmarc)), Some((Some("pass"), Some("pass"), Some("fail"))));

    // Mail stored before sizes were kept is filled in by the catch-up.
    {
        let store = mailbox.store.lock()?;
        let mut older = store.get(&taken.id)?;
        (older.size, older.checks) = (None, None);
        store.delete(&taken.id)?;
        store.insert(&older, raw)?;
    }
    assert!(mailbox.catch_up(10)? >= 1);
    let caught = mailbox.store.lock()?.get(&taken.id)?;
    assert_eq!((caught.size, caught.checks.as_deref()), (i64::try_from(raw.len()).ok(), Some("spf=pass dkim=pass dmarc=fail by=mx.example")));
    Ok(())
}

#[test]
fn a_blocked_sender_goes_straight_to_the_trash_unannounced() -> Result<(), AppError> {
    let (_folder, mailbox) = mailbox();
    let block = Rule::new("Block spam", When { from: Some("*@spam.example".to_owned()), ..When::default() }, vec![Action::Trash]);
    mailbox.save_rule(block, &Actor::You)?;
    let raw = b"From: Deals <deals@spam.example>\r\nTo: hello@flung.dev\r\nSubject: Win\r\nMessage-ID: <w1@spam.example>\r\n\r\nWin big\r\n";
    assert_eq!(mailbox.take_in(raw, "hello@flung.dev", 1_795_000_000)?, None, "not announced");
    let trashed = mailbox.view(buun_mail_store::View::Trashed)?;
    assert_eq!(trashed.iter().map(|message| message.subject.as_str()).collect::<Vec<_>>(), vec!["Win"]);
    Ok(())
}

#[test]
fn saves_attachments_into_a_folder_a_rule_names_without_overwriting() -> Result<(), AppError> {
    let (folder, mailbox) = mailbox();
    let target = folder.path().join("invoices");
    let rule = Rule::new(
        "Save invoices",
        When { from: Some("*@stripe.com".to_owned()), ..When::default() },
        vec![Action::SaveAttachments { folder: target.display().to_string() }],
    );
    mailbox.save_rule(rule, &Actor::You)?;
    let message = |id: &str| {
        format!(
            "From: receipts@stripe.com\r\nTo: billing@flung.dev\r\nSubject: Invoice {id}\r\nMessage-ID: <{id}@stripe.com>\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=b\r\n\r\n--b\r\nContent-Type: text/plain\r\n\r\nAttached.\r\n--b\r\nContent-Type: application/pdf\r\nContent-Disposition: attachment; filename=\"../invoice.pdf\"\r\nContent-Transfer-Encoding: base64\r\n\r\nJVBERi0xLjQ=\r\n--b--\r\n"
        )
    };
    let _ = mailbox.take_in(message("i1").as_bytes(), "billing@flung.dev", 1_795_000_000)?;
    let _ = mailbox.take_in(message("i2").as_bytes(), "billing@flung.dev", 1_795_000_001)?;
    let mut saved: Vec<String> =
        fs::read_dir(&target).map(|entries| entries.flatten().map(|entry| entry.file_name().to_string_lossy().into_owned()).collect()).unwrap_or_default();
    saved.sort();
    assert_eq!(saved, ["invoice (2).pdf", "invoice.pdf"], "kept inside the folder, never over the first");
    assert_eq!(fs::read(target.join("invoice.pdf")).unwrap_or_default(), b"%PDF-1.4");
    assert!(
        Rule::new(
            "Bad",
            When { from: Some("*@x.example".to_owned()), ..When::default() },
            vec![Action::SaveAttachments { folder: "relative/path".to_owned() }]
        )
        .check()
        .is_err()
    );
    Ok(())
}

fn editable_mailbox() -> (tempfile::TempDir, PathBuf, Mailbox) {
    let folder = tempfile::tempdir().unwrap_or_else(|error| unreachable!("temp folder: {error}"));
    let routing = folder.path().join("workspaces.toml");
    fs::write(&routing, TEST_ROUTING).unwrap_or_else(|error| unreachable!("routing file: {error}"));
    let store = Store::open(&folder.path().join("store")).unwrap_or_else(|error| unreachable!("store: {error}"));
    let router = Router::from_toml(TEST_ROUTING).unwrap_or_else(|error| unreachable!("routing: {error}"));
    let mailbox = Mailbox::new(router, store, routing.clone()).unwrap_or_else(|error| unreachable!("mailbox: {error}"));
    (folder, routing, mailbox)
}

fn edit(id: Option<&str>, name: &str, addresses: &[&str]) -> super::WorkspaceEdit {
    super::WorkspaceEdit {
        id: id.map(str::to_owned),
        name: name.to_owned(),
        addresses: addresses.iter().map(|address| (*address).to_owned()).collect(),
        folders: vec![],
    }
}

#[test]
fn adds_a_workspace_and_files_unsorted_mail_it_now_claims() -> Result<(), AppError> {
    let (folder, routing, mailbox) = editable_mailbox();
    mailbox.import_files(&[file(&folder, "stranger.eml", STRANGER)])?;
    assert_eq!(mailbox.messages(&placement(UNSORTED_WORKSPACE, None))?.len(), 1);

    let mut new = edit(None, "  Old Domain ", &[" *@Forwarded.example "]);
    new.folders = vec![super::routing::FolderEdit { name: "News".to_owned(), from: "*@letters.example".to_owned(), icon: None }];
    let id = mailbox.save_workspace(&new, &Actor::You)?;
    assert_eq!(id, "old-domain");
    assert_eq!(mailbox.messages(&placement("old-domain", Some("News")))?.len(), 1, "the unsorted message moved to its new home");
    assert_eq!(mailbox.messages(&placement(UNSORTED_WORKSPACE, None))?.len(), 0);

    let text = fs::read_to_string(&routing).unwrap_or_default();
    assert!(text.contains("# An environment is its own workspace"), "comments survive: {text}");
    assert!(text.contains("match = [\"*@forwarded.example\"]"), "addresses are trimmed and lowercased: {text}");
    assert_eq!(mailbox.save_workspace(&edit(None, "Old domain", &["x@other.example"]), &Actor::You)?, "old-domain-2", "ids never collide");
    Ok(())
}

#[test]
fn edits_a_workspace_in_place_and_keeps_its_icon() -> Result<(), AppError> {
    let (_folder, routing, mailbox) = editable_mailbox();
    let mut flung =
        mailbox.routing_workspaces()?.into_iter().find(|workspace| workspace.id.as_deref() == Some("flung")).unwrap_or_else(|| unreachable!("flung"));
    flung.name = "Flung HQ".to_owned();
    flung.addresses.push("*@flung.app".to_owned());
    mailbox.save_workspace(&flung, &Actor::You)?;
    let shown = mailbox.workspaces()?.into_iter().find(|workspace| workspace.id == "flung").unwrap_or_else(|| unreachable!("flung"));
    assert_eq!((shown.name.as_str(), shown.icon.as_deref(), shown.addresses.len()), ("Flung HQ", Some("flung"), 2));
    let text = fs::read_to_string(&routing).unwrap_or_default();
    assert_eq!(text.matches("[[workspace]]").count(), 6, "changed in place, not appended");
    Ok(())
}

#[test]
fn refuses_an_edit_that_would_break_the_file_and_leaves_it_alone() -> Result<(), AppError> {
    let (_folder, routing, mailbox) = editable_mailbox();
    let before = fs::read_to_string(&routing).unwrap_or_default();
    assert!(mailbox.save_workspace(&edit(None, "Clash", &["*@flung.dev"]), &Actor::You).is_err(), "a pattern another workspace claims");
    assert!(mailbox.save_workspace(&edit(None, "", &["*@new.example"]), &Actor::You).is_err(), "no name");
    assert!(mailbox.save_workspace(&edit(None, "Empty", &[" "]), &Actor::You).is_err(), "no address");
    assert!(mailbox.delete_workspace("nope", &Actor::You).is_err());
    assert_eq!(fs::read_to_string(&routing).unwrap_or_default(), before);
    assert_eq!(mailbox.workspaces()?.iter().filter(|workspace| workspace.id == "clash").count(), 0);
    Ok(())
}

#[test]
fn deletes_a_workspace_and_files_its_mail_again() -> Result<(), AppError> {
    let (folder, routing, mailbox) = editable_mailbox();
    mailbox.import_files(&[file(&folder, "client.eml", CLIENT)])?;
    assert_eq!(mailbox.messages(&placement("buun", None))?.len(), 1);
    assert_eq!(mailbox.delete_workspace("buun", &Actor::You)?, 1);
    assert_eq!(mailbox.messages(&placement(UNSORTED_WORKSPACE, None))?.len(), 1, "nothing claims hello@buungroup.com now");
    assert!(mailbox.workspaces()?.iter().all(|workspace| workspace.id != "buun"));
    let text = fs::read_to_string(&routing).unwrap_or_default();
    assert!(!text.contains("id = \"buun\""));
    assert!(text.contains("id = \"personal\""));
    Ok(())
}
