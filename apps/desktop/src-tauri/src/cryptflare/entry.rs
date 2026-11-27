//! What a dissolve.email agent identity becomes in `CryptFlare`: one secret per identity, its key from the address,
//! every private detail (password, persona) in the encrypted value, and only links (source, ids, expiry) in the
//! metadata, which `CryptFlare` keeps unencrypted.

use std::collections::BTreeMap;

use serde_json::json;

use super::settings::Pending;
use crate::dissolve::{IdentityChange, IdentityRecord};

/// Every identity's key starts with this.
pub const IDENTITY_PREFIX: &str = "DISSOLVE_";

/// The longest key `CryptFlare` takes.
const KEY_MAX: usize = 256;

/// The metadata `source` of everything this app writes.
pub const SOURCE: &str = "buun-mail";

/// The secret key for an identity's address: `ada@shop.example` gives `DISSOLVE_ADA_SHOP_EXAMPLE`. Upper snake case,
/// as `CryptFlare` requires (`^[A-Z][A-Z0-9_]*$`, at most 256 characters).
#[must_use]
pub fn identity_key(email: &str) -> String {
    let mut key = String::from(IDENTITY_PREFIX);
    for character in email.trim().to_ascii_uppercase().chars() {
        let next = if character.is_ascii_alphanumeric() { character } else { '_' };
        if !(next == '_' && key.ends_with('_')) {
            key.push(next);
        }
    }
    let mut key = key.trim_end_matches('_').to_owned();
    key.truncate(KEY_MAX);
    key
}

/// The words beside an identity in `CryptFlare`.
fn description(record: &IdentityRecord) -> String {
    match record.label.as_deref().filter(|label| !label.trim().is_empty()) {
        Some(label) => format!("dissolve.email agent identity: {label}"),
        None => "dissolve.email agent identity".to_owned(),
    }
}

/// The links kept beside an identity. Never its name, phone or address: those are in the encrypted value.
fn metadata(record: &IdentityRecord) -> BTreeMap<String, String> {
    let mut found = BTreeMap::from([
        ("source".to_owned(), SOURCE.to_owned()),
        ("kind".to_owned(), "dissolve-identity".to_owned()),
        ("identityId".to_owned(), record.identity_id.clone()),
    ]);
    if let Some(inbox) = &record.inbox_id {
        found.insert("inboxId".to_owned(), inbox.clone());
    }
    if let Some(expires) = &record.expires_at {
        found.insert("expiresAt".to_owned(), expires.clone());
    }
    found
}

/// The encrypted value: the whole identity as JSON.
fn value(record: &IdentityRecord) -> String {
    json!({ "email": record.email, "password": record.password, "label": record.label, "persona": record.persona, "identityId": record.identity_id })
        .to_string()
}

/// The save a change asks for, by key, or `None` when there is nothing to write (a made identity whose password
/// dissolve.email could not open just now). `written` is the metadata last written, which an ended identity keeps.
#[must_use]
pub fn save_for(change: &IdentityChange, written: &BTreeMap<String, BTreeMap<String, String>>, now_rfc3339: &str) -> Option<(String, Pending)> {
    match change {
        IdentityChange::Saved(record) => {
            record.password.as_ref()?;
            Some((
                identity_key(&record.email),
                Pending { value: value(record), description: Some(description(record)), metadata: metadata(record), ..Pending::default() },
            ))
        }
        IdentityChange::Updated(record) => {
            Some((identity_key(&record.email), Pending { description: Some(description(record)), metadata: metadata(record), ..Pending::default() }))
        }
        IdentityChange::Ended { identity_id, email } => {
            let key = identity_key(email);
            let mut kept = written.get(&key).cloned().unwrap_or_else(|| BTreeMap::from([("source".to_owned(), SOURCE.to_owned())]));
            if let Some(id) = identity_id {
                kept.entry("identityId".to_owned()).or_insert_with(|| id.clone());
            }
            kept.insert("ended".to_owned(), now_rfc3339.to_owned());
            Some((key, Pending { metadata: kept, ..Pending::default() }))
        }
    }
}

/// Puts `next` in the queue under `key`. A save that carries no value keeps the value of one still waiting, so a
/// rename straight after making an identity still writes its password.
pub fn queue(pending: &mut BTreeMap<String, Pending>, key: String, mut next: Pending) {
    if let Some(waiting) = pending.get(&key) {
        if next.value.is_empty() {
            next.value.clone_from(&waiting.value);
        }
        if next.description.is_none() {
            next.description.clone_from(&waiting.description);
        }
        let mut metadata = waiting.metadata.clone();
        metadata.extend(next.metadata);
        next.metadata = metadata;
    }
    pending.insert(key, next);
}

#[cfg(test)]
mod unit {
    use super::*;

    fn record(password: Option<&str>) -> IdentityRecord {
        IdentityRecord {
            identity_id: "idn_1".to_owned(),
            inbox_id: Some("inb_1".to_owned()),
            email: "ada.x-1@shop.example".to_owned(),
            password: password.map(str::to_owned),
            persona: Some(json!({ "fullName": "Ada Example", "phone": "07700 900123" })),
            label: Some("GitHub".to_owned()),
            expires_at: Some("2026-12-01T00:00:00Z".to_owned()),
        }
    }

    #[test]
    fn names_a_key_cryptflare_accepts() {
        assert_eq!(identity_key("ada.x-1@shop.example"), "DISSOLVE_ADA_X_1_SHOP_EXAMPLE");
        assert_eq!(identity_key(" a..b@c "), "DISSOLVE_A_B_C");
        assert!(identity_key(&"a".repeat(400)).len() <= KEY_MAX);
    }

    #[test]
    fn keeps_private_details_in_the_value_and_only_links_in_the_metadata() {
        let Some((key, save)) = save_for(&IdentityChange::Saved(record(Some("pw-1"))), &BTreeMap::new(), "now") else { unreachable!("a save") };
        assert_eq!(key, "DISSOLVE_ADA_X_1_SHOP_EXAMPLE");
        assert!(save.value.contains("pw-1") && save.value.contains("Ada Example") && save.value.contains("07700"));
        let links = serde_json::to_string(&save.metadata).unwrap_or_default();
        assert!(!links.contains("Ada") && !links.contains("07700") && !links.contains("pw-1"), "{links}");
        assert_eq!(save.metadata.get("inboxId").map(String::as_str), Some("inb_1"));
        assert_eq!(save.description.as_deref(), Some("dissolve.email agent identity: GitHub"));
        assert!(save_for(&IdentityChange::Saved(record(None)), &BTreeMap::new(), "now").is_none(), "nothing to save without the password");
    }

    #[test]
    fn a_later_change_keeps_a_waiting_value_and_an_ended_one_keeps_what_was_written() {
        let mut pending = BTreeMap::new();
        let Some((key, made)) = save_for(&IdentityChange::Saved(record(Some("pw-1"))), &BTreeMap::new(), "now") else { unreachable!("a save") };
        queue(&mut pending, key.clone(), made);
        let Some((_, renamed)) = save_for(&IdentityChange::Updated(record(None)), &BTreeMap::new(), "now") else { unreachable!("a save") };
        queue(&mut pending, key.clone(), renamed);
        assert!(pending.get(&key).is_some_and(|save| save.value.contains("pw-1")));

        let written = BTreeMap::from([(key.clone(), BTreeMap::from([("inboxId".to_owned(), "inb_1".to_owned())]))]);
        let Some((_, ended)) =
            save_for(&IdentityChange::Ended { identity_id: None, email: "ada.x-1@shop.example".to_owned() }, &written, "2026-11-27T00:00:00Z")
        else {
            unreachable!("a save")
        };
        assert_eq!(ended.metadata.get("inboxId").map(String::as_str), Some("inb_1"));
        assert_eq!(ended.metadata.get("ended").map(String::as_str), Some("2026-11-27T00:00:00Z"));
        assert_eq!(ended.value, "");
    }
}
