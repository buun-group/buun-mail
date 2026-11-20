//! A backup made and restored whole, and refused when the passphrase is wrong or the file was touched.

use std::fs;
use std::path::Path;

use super::{BackupPaths, apply_pending, create, stage_restore};

fn tree(root: &Path) -> BackupPaths {
    let paths = BackupPaths { config: root.join("config"), store: root.join("data").join("store") };
    fs::create_dir_all(paths.store.join("raw/ab")).unwrap_or_else(|error| unreachable!("{error}"));
    fs::create_dir_all(&paths.config).unwrap_or_else(|error| unreachable!("{error}"));
    fs::write(paths.config.join("vault.key"), "key").unwrap_or_else(|error| unreachable!("{error}"));
    fs::write(paths.config.join("senders.json"), "[]").unwrap_or_else(|error| unreachable!("{error}"));
    fs::write(paths.config.join("half.partial"), "skip").unwrap_or_else(|error| unreachable!("{error}"));
    fs::write(paths.store.join("index.sqlite"), vec![7_u8; 3 * 1024 * 1024]).unwrap_or_else(|error| unreachable!("{error}"));
    fs::write(paths.store.join("raw/ab/abcdef.eml"), "From: a@b.example\r\n\r\nhi").unwrap_or_else(|error| unreachable!("{error}"));
    paths
}

#[test]
fn restores_everything_at_the_next_start_and_keeps_what_it_replaced() {
    let folder = tempfile::tempdir().unwrap_or_else(|error| unreachable!("{error}"));
    let paths = tree(folder.path());
    let file = folder.path().join("mail.buunmail");
    assert_eq!(create(&paths, &file, "correct horse").ok(), Some(4), "the unfinished write is left out");
    // Changes after the backup, which a restore puts back as they were.
    fs::write(paths.config.join("senders.json"), "[\"changed\"]").unwrap_or_else(|error| unreachable!("{error}"));
    assert_eq!(stage_restore(&paths, &file, "correct horse").ok(), Some(4));
    assert_eq!(apply_pending(&paths, 1).ok(), Some(true));
    assert_eq!(fs::read_to_string(paths.config.join("senders.json")).unwrap_or_default(), "[]");
    assert_eq!(fs::read(paths.store.join("index.sqlite")).map_or(0, |bytes| bytes.len()), 3 * 1024 * 1024);
    assert!(paths.store.join("raw/ab/abcdef.eml").exists());
    let kept = folder.path().join("data/before-restore-1/config/senders.json");
    assert_eq!(fs::read_to_string(kept).unwrap_or_default(), "[\"changed\"]");
    assert_eq!(apply_pending(&paths, 2).ok(), Some(false), "nothing waits once applied");
}

#[test]
fn refuses_a_wrong_passphrase_a_touched_file_and_a_cut_one() {
    let folder = tempfile::tempdir().unwrap_or_else(|error| unreachable!("{error}"));
    let paths = tree(folder.path());
    let file = folder.path().join("mail.buunmail");
    let _ = create(&paths, &file, "correct horse");
    assert!(stage_restore(&paths, &file, "wrong horse").is_err_and(|error| error.to_string().contains("Wrong passphrase")));
    let mut bytes = fs::read(&file).unwrap_or_default();
    let middle = bytes.len() / 2;
    bytes[middle] ^= 1;
    fs::write(&file, &bytes).unwrap_or_else(|error| unreachable!("{error}"));
    assert!(stage_restore(&paths, &file, "correct horse").is_err());
    bytes[middle] ^= 1;
    bytes.truncate(bytes.len() - 100);
    fs::write(&file, &bytes).unwrap_or_else(|error| unreachable!("{error}"));
    assert!(stage_restore(&paths, &file, "correct horse").is_err());
    assert!(!folder.path().join("data/restore-pending").exists(), "nothing half restored is left");
    assert_eq!(apply_pending(&paths, 3).ok(), Some(false));
}

#[test]
fn a_live_mailbox_comes_back_whole() {
    use std::sync::Arc;

    use buun_mail_routing::Router;
    use buun_mail_store::Store;

    use crate::mailbox::Mailbox;
    use crate::paths::TEST_ROUTING;

    let folder = tempfile::tempdir().unwrap_or_else(|error| unreachable!("{error}"));
    let paths = BackupPaths { config: folder.path().join("config"), store: folder.path().join("data/store") };
    fs::create_dir_all(&paths.config).unwrap_or_else(|error| unreachable!("{error}"));
    let router = Router::from_toml(TEST_ROUTING).unwrap_or_else(|error| unreachable!("{error}"));
    let mailbox = Arc::new(
        Mailbox::new(router, Store::open(&paths.store).unwrap_or_else(|error| unreachable!("{error}")), paths.config.join("workspaces.toml"))
            .unwrap_or_else(|error| unreachable!("{error}")),
    );
    let raw = b"From: Client <c@client.example>\r\nTo: hello@flung.dev\r\nSubject: Kept safe\r\nMessage-ID: <k1@client.example>\r\n\r\nHi\r\n";
    let id = mailbox.take_in(raw, "hello@flung.dev", 1_795_000_000).ok().flatten().map(|message| message.id).unwrap_or_default();
    let file = folder.path().join("live.buunmail");
    let made = mailbox.with_store_still(|| create(&paths, &file, "correct horse")).ok().and_then(Result::ok);
    assert!(made.is_some_and(|count| count >= 2));
    drop(mailbox);

    let elsewhere = tempfile::tempdir().unwrap_or_else(|error| unreachable!("{error}"));
    let other = BackupPaths { config: elsewhere.path().join("config"), store: elsewhere.path().join("data/store") };
    assert!(stage_restore(&other, &file, "correct horse").is_ok());
    assert_eq!(apply_pending(&other, 1).ok(), Some(true));
    let reopened = Store::open(&other.store).unwrap_or_else(|error| unreachable!("{error}"));
    assert_eq!(reopened.get(&id).map(|message| message.subject).ok().as_deref(), Some("Kept safe"));
    assert_eq!(reopened.raw(&id).ok().as_deref(), Some(&raw[..]));
}
