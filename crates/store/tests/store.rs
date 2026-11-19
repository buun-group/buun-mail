//! The store against a real folder on disk.

use buun_mail_store::{Inserted, MessageRecord, Placement, Shelf, Store, StoreError, View};

fn placement(workspace: &str, folder: Option<&str>) -> Placement {
    Placement { workspace: workspace.to_owned(), folder: folder.map(str::to_owned) }
}

fn record(id: &str, workspace: &str, folder: Option<&str>, sent_at: i64) -> MessageRecord {
    MessageRecord {
        id: id.to_owned(),
        placement: placement(workspace, folder),
        matched: Some(format!("*@{workspace}.com")),
        folder_matched: None,
        from_name: "Ada".to_owned(),
        from: "ada@example.com".to_owned(),
        to: format!("hello@{workspace}.com"),
        subject: format!("Message {id}"),
        preview: "Hello".to_owned(),
        sent_at,
        message_id: None,
        unread: true,
        starred: false,
        shelf: Shelf::Active,
        tags: Vec::new(),
        thread_id: None,
        thread_size: 1,
        snoozed_until: None,
    }
}

fn store() -> Result<(tempfile::TempDir, Store), StoreError> {
    let folder = tempfile::tempdir()?;
    let store = Store::open(folder.path())?;
    Ok((folder, store))
}

#[test]
fn stores_a_message_once() -> Result<(), StoreError> {
    let (_folder, store) = store()?;
    let message = record("aa11", "acme", None, 10);
    assert_eq!(store.insert(&message, b"raw bytes")?, Inserted::New);
    assert_eq!(store.insert(&message, b"raw bytes")?, Inserted::Duplicate);
    assert_eq!(store.list(&placement("acme", None))?.len(), 1);
    assert_eq!(store.raw("aa11")?, b"raw bytes");
    Ok(())
}

#[test]
fn lists_one_folder_newest_first() -> Result<(), StoreError> {
    let (_folder, store) = store()?;
    store.insert(&record("aa01", "acme", None, 10), b"1")?;
    store.insert(&record("aa02", "acme", None, 30), b"2")?;
    store.insert(&record("aa03", "acme", Some("Receipts"), 20), b"3")?;
    store.insert(&record("aa04", "globex", None, 40), b"4")?;
    let inbox: Vec<_> = store.list(&placement("acme", None))?.into_iter().map(|message| message.id).collect();
    assert_eq!(inbox, ["aa02", "aa01"]);
    assert_eq!(store.list(&placement("acme", Some("Receipts")))?.len(), 1);
    Ok(())
}

#[test]
fn counts_and_clears_unread() -> Result<(), StoreError> {
    let (_folder, store) = store()?;
    store.insert(&record("aa01", "acme", None, 1), b"1")?;
    store.insert(&record("aa02", "acme", None, 2), b"2")?;
    store.insert(&record("aa03", "acme", Some("Receipts"), 3), b"3")?;

    assert!(store.mark_read("aa01")?);
    assert!(!store.mark_read("aa01")?);
    let counts = store.unread_counts()?;
    assert_eq!(counts.iter().map(|count| count.unread).sum::<u32>(), 2);

    assert_eq!(store.mark_all_read(&placement("acme", None), false)?, 1);
    assert_eq!(store.mark_all_read(&placement("acme", None), true)?, 1);
    assert_eq!(store.unread_counts()?, []);
    Ok(())
}

#[test]
fn reopens_with_its_messages() -> Result<(), StoreError> {
    let folder = tempfile::tempdir()?;
    Store::open(folder.path())?.insert(&record("aa01", "acme", None, 1), b"1")?;
    let again = Store::open(folder.path())?;
    assert_eq!(again.get("aa01")?.subject, "Message aa01");
    Ok(())
}

#[test]
fn says_when_a_message_is_missing() -> Result<(), StoreError> {
    let (_folder, store) = store()?;
    let result = store.get("nope");
    assert!(matches!(result, Err(StoreError::NotFound(_))), "{result:?}");
    Ok(())
}

#[test]
fn tags_messages_and_finds_them() -> Result<(), StoreError> {
    let (_folder, store) = store()?;
    let mut tagged = record("aa01", "acme", None, 1);
    tagged.tags = vec!["invoice".to_owned()];
    store.insert(&tagged, b"1")?;
    store.insert(&record("aa02", "globex", None, 2), b"2")?;

    store.add_tags("aa02", &["urgent".to_owned(), "invoice".to_owned(), " ".to_owned()])?;
    assert_eq!(store.get("aa02")?.tags, ["invoice", "urgent"]);
    assert_eq!(store.tag_counts()?, [("invoice".to_owned(), 2), ("urgent".to_owned(), 1)]);
    assert!(store.remove_tag("aa02", "urgent")?);

    let found: Vec<_> = store.search("invoice", None, false, 10)?.into_iter().map(|message| message.id).collect();
    assert_eq!(found, ["aa02", "aa01"]);
    assert_eq!(store.search("invoice", Some("acme"), false, 10)?.len(), 1);
    assert_eq!(store.search("100%", None, false, 10)?.len(), 0);
    assert!(matches!(store.add_tags("nope", &["x".to_owned()]), Err(StoreError::NotFound(_))));
    Ok(())
}

#[test]
fn moves_a_message_and_keeps_rules_in_order() -> Result<(), StoreError> {
    let (_folder, store) = store()?;
    store.insert(&record("aa01", "acme", None, 1), b"1")?;
    store.move_to("aa01", &placement("globex", Some("Later")))?;
    assert_eq!(store.get("aa01")?.placement, placement("globex", Some("Later")));

    store.save_rule(&buun_mail_store::StoredRule { id: "b".to_owned(), body: "{}".to_owned() })?;
    store.save_rule(&buun_mail_store::StoredRule { id: "a".to_owned(), body: "{}".to_owned() })?;
    store.save_rule(&buun_mail_store::StoredRule { id: "b".to_owned(), body: "{\"v\":2}".to_owned() })?;
    let rules = store.rules()?;
    assert_eq!(rules.iter().map(|rule| rule.id.as_str()).collect::<Vec<_>>(), ["b", "a"]);
    assert_eq!(rules.first().map(|rule| rule.body.as_str()), Some("{\"v\":2}"));
    assert!(store.delete_rule("a")?);
    Ok(())
}

#[test]
fn logs_activity_newest_first() -> Result<(), StoreError> {
    let (_folder, store) = store()?;
    for (at, action) in [(1, "tag"), (2, "move")] {
        store.log(&buun_mail_store::Activity { at, actor: "agent:claude".to_owned(), action: action.to_owned(), detail: String::new() })?;
    }
    assert_eq!(store.activity(10)?.first().map(|entry| entry.action.as_str()), Some("move"));
    Ok(())
}

#[test]
fn archives_trashes_restores_and_deletes_for_good() -> Result<(), StoreError> {
    let (_folder, store) = store()?;
    store.insert(&record("aa01", "acme", None, 10), b"one")?;
    store.insert(&record("bb02", "acme", None, 20), b"two")?;
    let inbox = placement("acme", None);

    assert!(store.set_shelf("aa01", Shelf::Archived, 100)?);
    assert_eq!(store.list(&inbox)?.len(), 1);
    assert_eq!(store.view(View::Archived)?.first().map(|record| record.id.as_str()), Some("aa01"));
    assert_eq!(store.unread_counts()?.first().map(|count| count.unread), Some(1));

    assert!(store.set_shelf("bb02", Shelf::Trashed, 200)?);
    assert_eq!(store.list(&inbox)?.len(), 0);
    assert_eq!(store.trashed_before(Some(150))?, Vec::<String>::new());
    assert_eq!(store.trashed_before(Some(250))?, vec!["bb02".to_owned()]);

    assert!(store.set_shelf("aa01", Shelf::Active, 300)?);
    assert_eq!(store.list(&inbox)?.first().map(|record| record.shelf), Some(Shelf::Active));

    assert!(store.delete("bb02")?);
    assert!(store.raw("bb02").is_err());
    assert_eq!(store.view(View::Trashed)?.len(), 0);
    assert!(!store.delete("bb02")?);
    Ok(())
}

#[test]
fn stars_and_marks_unread() -> Result<(), StoreError> {
    let (_folder, store) = store()?;
    store.insert(&record("cc03", "acme", None, 10), b"three")?;
    assert!(store.set_starred("cc03", true)?);
    assert!(!store.set_starred("cc03", true)?);
    assert_eq!(store.view(View::Starred)?.len(), 1);
    store.set_shelf("cc03", Shelf::Trashed, 5)?;
    assert_eq!(store.view(View::Starred)?.len(), 0);
    assert!(store.mark_read("cc03")?);
    assert!(store.set_unread("cc03", true)?);
    assert!(store.get("cc03")?.unread);
    Ok(())
}

#[test]
fn suggests_contacts_most_frequent_first() -> Result<(), StoreError> {
    let (_folder, store) = store()?;
    let mut one = record("dd04", "acme", None, 10);
    one.from = "zed@x.com".to_owned();
    one.from_name = "Zed".to_owned();
    store.insert(&one, b"a")?;
    store.insert(&record("ee05", "acme", None, 11), b"b")?;
    store.insert(&record("ff06", "acme", None, 12), b"c")?;
    let found = store.contacts("", 10)?;
    assert_eq!(found.first().map(|(_, address, seen)| (address.as_str(), *seen)), Some(("ada@example.com", 2)));
    assert_eq!(store.contacts("zed", 10)?.len(), 1);
    Ok(())
}

#[test]
fn links_replies_into_one_conversation_whichever_arrives_first() -> Result<(), StoreError> {
    let (_folder, store) = store()?;
    for (id, at) in [("c1", 30), ("a1", 10), ("b1", 20)] {
        store.insert(&record(id, "acme", None, at), id.as_bytes())?;
    }
    // The reply to the reply arrives first, then the original, then the middle message.
    let late = store.link("c1", Some("c@x"), &["a@x".to_owned(), "b@x".to_owned()])?;
    let first = store.link("a1", Some("a@x"), &[])?;
    let middle = store.link("b1", Some("b@x"), &["a@x".to_owned()])?;
    assert_eq!(late, "c@x");
    assert_eq!(first, "c@x");
    assert_eq!(middle, "c@x");
    let thread = store.thread("c@x")?;
    assert_eq!(thread.iter().map(|record| record.id.as_str()).collect::<Vec<_>>(), vec!["a1", "b1", "c1"]);
    assert_eq!(thread.first().map(|record| record.thread_size), Some(3));
    assert_eq!(store.unlinked(10)?.len(), 0);
    Ok(())
}

#[test]
fn searches_subject_people_and_text_by_word_starts() -> Result<(), StoreError> {
    let (_folder, store) = store()?;
    store.insert(&record("s1", "acme", None, 10), b"one")?;
    store.insert(&record("s2", "acme", None, 20), b"two")?;
    store.index_text("s1", "Invoice for November", "Stripe invoices@stripe.com", "Your invoice INV-2026-11 is ready")?;
    store.index_text("s2", "Lunch", "Ada ada@example.com", "Friday at the café")?;
    assert_eq!(store.search_text("invo nov", 10)?.iter().map(|record| record.id.as_str()).collect::<Vec<_>>(), vec!["s1"]);
    assert_eq!(store.search_text("cafe", 10)?.len(), 1);
    assert_eq!(store.search_text("\"", 10)?.len(), 0);
    store.set_shelf("s2", Shelf::Trashed, 1)?;
    assert_eq!(store.search_text("friday", 10)?.len(), 0);
    store.delete("s1")?;
    assert_eq!(store.search_text("invoice", 10)?.len(), 0);
    Ok(())
}

#[test]
fn snoozes_out_of_the_folder_and_wakes_unread() -> Result<(), StoreError> {
    let (_folder, store) = store()?;
    store.insert(&record("z1", "acme", None, 10), b"z")?;
    store.mark_read("z1")?;
    assert!(store.set_snooze("z1", Some(1_000))?);
    let inbox = placement("acme", None);
    assert_eq!(store.list(&inbox)?.len(), 0);
    assert_eq!(store.view(View::Snoozed)?.first().and_then(|record| record.snoozed_until), Some(1_000));
    assert_eq!(store.wake_due(999)?.len(), 0);
    assert_eq!(store.wake_due(1_000)?, vec!["z1".to_owned()]);
    let back = store.list(&inbox)?;
    assert_eq!(back.first().map(|record| (record.unread, record.snoozed_until)), Some((true, None)));
    Ok(())
}
