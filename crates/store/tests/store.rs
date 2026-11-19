//! The store against a real folder on disk.

use buun_mail_store::{Inserted, MessageRecord, Placement, Store, StoreError};

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
    assert!(matches!(store.get("nope"), Err(StoreError::NotFound(_))));
    Ok(())
}
