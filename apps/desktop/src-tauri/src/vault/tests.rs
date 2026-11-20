//! Sealing secrets, sealing an older version's plain ones, and the reveal code.

use std::fs;

use super::reveal::RevealLock;
use super::{open, seal, unseal};

#[test]
fn seals_and_opens_a_secret_never_the_same_way_twice() {
    let sealed = seal("re_secret_key");
    assert!(sealed.starts_with("sealed:v1:") && !sealed.contains("re_secret_key"));
    assert_ne!(sealed, seal("re_secret_key"));
    assert_eq!(unseal(&sealed).as_deref(), Some("re_secret_key"));
    assert_eq!(unseal("plain from an older version").as_deref(), Some("plain from an older version"));
    assert_eq!(unseal("sealed:v1:AAAA"), None);
}

#[test]
fn seals_the_plain_secrets_an_older_version_left_and_keeps_the_key() {
    let folder = tempfile::tempdir().unwrap_or_else(|error| unreachable!("{error}"));
    fs::write(folder.path().join("senders.json"), r#"[{"id":"s1","name":"Resend","apiKey":"re_live_123","signature":"Hi"}]"#)
        .unwrap_or_else(|error| unreachable!("{error}"));
    fs::write(folder.path().join("gateways.json"), r#"[{"id":"g1","name":"G","url":"https://g.example","token":"bmg_abc"}]"#)
        .unwrap_or_else(|error| unreachable!("{error}"));
    open(folder.path()).unwrap_or_else(|error| unreachable!("{error}"));
    let senders = fs::read_to_string(folder.path().join("senders.json")).unwrap_or_default();
    let gateways = fs::read_to_string(folder.path().join("gateways.json")).unwrap_or_default();
    assert!(!senders.contains("re_live_123") && senders.contains("sealed:v1:") && senders.contains("\"signature\": \"Hi\""));
    assert!(!gateways.contains("bmg_abc") && gateways.contains("\"url\": \"https://g.example\""));
    let key = fs::read_to_string(folder.path().join("vault.key")).unwrap_or_default();
    open(folder.path()).unwrap_or_else(|error| unreachable!("{error}"));
    assert_eq!(fs::read_to_string(folder.path().join("vault.key")).unwrap_or_default(), key, "an update never makes a new key");
}

#[test]
fn asks_for_the_code_opens_for_a_while_and_waits_after_wrong_tries() {
    let folder = tempfile::tempdir().unwrap_or_else(|error| unreachable!("{error}"));
    let lock = RevealLock::open(folder.path());
    assert_eq!(lock.check(None), Ok(()), "no code set, nothing asked");
    assert!(lock.set_code(None, Some("12")).is_err_and(|error| error.contains("at least")));
    assert!(lock.set_code(None, Some("2468")).is_ok_and(|status| status.code_set));
    let saved = fs::read_to_string(folder.path().join("security.json")).unwrap_or_default();
    assert!(saved.contains("$argon2id$") && !saved.contains("2468"));

    let reopened = RevealLock::open(folder.path());
    assert!(reopened.check(None).is_err_and(|error| error.contains("Enter")));
    assert!(reopened.check(Some("1111")).is_err_and(|error| error.contains("not right")));
    assert_eq!(reopened.check(Some("2468")), Ok(()));
    assert_eq!(reopened.check(None), Ok(()), "open for a while after a right code");
    reopened.lock();
    for _ in 0..5 {
        let _ = reopened.check(Some("0000"));
    }
    assert!(reopened.check(Some("2468")).is_err_and(|error| error.contains("Try again")));
}
