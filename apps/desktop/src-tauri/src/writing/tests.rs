//! Templates and workspace profiles, saved and read back.

use super::{Profile, Template, WritingStore};

#[test]
fn saves_templates_and_profiles_and_reads_them_back() {
    let folder = tempfile::tempdir().unwrap_or_else(|error| unreachable!("{error}"));
    let store = WritingStore::open(folder.path().to_path_buf());
    assert!(store.save_template(Template { id: String::new(), name: " ".to_owned(), workspace: None, subject: String::new(), text: "x".to_owned() }).is_err());
    let saved = store
        .save_template(Template {
            id: String::new(),
            name: "Quote sent".to_owned(),
            workspace: Some("gunspec".to_owned()),
            subject: "Your quote".to_owned(),
            text: "Here is your quote.".to_owned(),
        })
        .unwrap_or_default();
    let id = saved.templates[0].id.clone();
    let _ = store.save_profile("gunspec", &Profile { signature: "Sacha\nGunSpec".to_owned(), from: "Hello@GunSpec.io".to_owned() });
    let reopened = WritingStore::open(folder.path().to_path_buf()).read().unwrap_or_default();
    assert_eq!(reopened.templates.len(), 1);
    assert_eq!(reopened.profiles.get("gunspec").map(|profile| profile.from.as_str()), Some("hello@gunspec.io"));
    let after = store.delete_template(&id).unwrap_or_default();
    assert_eq!(after.templates.len(), 0);
    let cleared = store.save_profile("gunspec", &Profile::default()).unwrap_or_default();
    assert_eq!(cleared.profiles.len(), 0);
}
