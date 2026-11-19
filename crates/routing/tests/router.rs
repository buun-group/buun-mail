//! The router against a routing file shaped like a real one: several businesses, a personal domain, shared senders.

use buun_mail_routing::{ConfigError, Envelope, Router, UNSORTED_WORKSPACE};

const ROUTING: &str = r#"
[[workspace]]
id = "acme"
name = "Acme"
match = ["*@acme.com", "acme@personal.dev"]
folders = [
  { name = "Receipts", from = "*@stripe.com" },
  { name = "Support", from = "help@acme.com" },
]

[[workspace]]
id = "globex"
name = "Globex"
match = ["*@globex.io"]

[[workspace]]
id = "personal"
name = "Personal"
match = ["*@personal.dev"]
"#;

fn router() -> Router {
    Router::from_toml(ROUTING).unwrap_or_else(|error| unreachable!("fixture routing file: {error}"))
}

fn place(router: &Router, from: &str, to: &str) -> (String, Option<String>) {
    let envelope = Envelope::parse(from, to).unwrap_or_else(|error| unreachable!("fixture envelope: {error}"));
    let route = router.route(&envelope);
    (route.workspace.as_str().to_owned(), route.folder.map(|folder| folder.as_str().to_owned()))
}

#[test]
fn the_recipient_domain_picks_the_workspace() {
    let router = router();
    assert_eq!(place(&router, "someone@example.com", "sales@acme.com"), ("acme".into(), None));
    assert_eq!(place(&router, "someone@example.com", "hello@globex.io"), ("globex".into(), None));
}

#[test]
fn an_exact_address_beats_its_domain_whatever_the_order() {
    let router = router();
    assert_eq!(place(&router, "someone@example.com", "acme@personal.dev").0, "acme");
    assert_eq!(place(&router, "someone@example.com", "me@personal.dev").0, "personal");
}

#[test]
fn says_which_rules_placed_a_message() {
    let router = router();
    let envelope = Envelope::parse("receipts@stripe.com", "acme@personal.dev").unwrap_or_else(|error| unreachable!("fixture envelope: {error}"));
    let route = router.route(&envelope);
    assert_eq!(route.matched.map(ToString::to_string).as_deref(), Some("acme@personal.dev"));
    assert_eq!(route.folder_matched.map(ToString::to_string).as_deref(), Some("*@stripe.com"));
}

#[test]
fn the_sender_picks_the_folder() {
    let router = router();
    assert_eq!(place(&router, "receipts@stripe.com", "billing@acme.com"), ("acme".into(), Some("Receipts".into())));
    assert_eq!(place(&router, "help@acme.com", "sales@acme.com"), ("acme".into(), Some("Support".into())));
}

#[test]
fn folders_belong_to_their_workspace() {
    let router = router();
    assert_eq!(place(&router, "receipts@stripe.com", "hello@globex.io"), ("globex".into(), None));
}

#[test]
fn unclaimed_mail_is_kept_in_unsorted() {
    let router = router();
    assert_eq!(place(&router, "someone@example.com", "who@elsewhere.net"), (UNSORTED_WORKSPACE.into(), None));
}

#[test]
fn lists_workspaces_in_file_order_then_unsorted() {
    let router = router();
    let ids: Vec<_> = router.workspaces().map(|workspace| workspace.id().as_str()).collect();
    assert_eq!(ids, ["acme", "globex", "personal", UNSORTED_WORKSPACE]);
}

#[test]
fn lists_each_folder_once_in_rule_order() {
    let router = Router::from_toml(
        r#"
        [[workspace]]
        id = "a"
        name = "A"
        match = ["*@a.com"]
        folders = [
          { name = "Receipts", from = "*@stripe.com" },
          { name = "Code", from = "*@github.com" },
          { name = "Receipts", from = "*@paddle.com" },
        ]
        "#,
    )
    .unwrap_or_else(|error| unreachable!("fixture routing file: {error}"));
    let folders: Vec<_> = router.workspaces().flat_map(|workspace| workspace.folders().map(|folder| folder.as_str().to_owned()).collect::<Vec<_>>()).collect();
    assert_eq!(folders, ["Receipts", "Code"]);
}

#[test]
fn refuses_a_pattern_two_workspaces_claim() {
    let result = Router::from_toml(
        r#"
        [[workspace]]
        id = "a"
        name = "A"
        match = ["*@acme.com"]

        [[workspace]]
        id = "b"
        name = "B"
        match = ["*@ACME.com"]
        "#,
    );
    assert!(matches!(result, Err(ConfigError::DuplicatePattern { .. })));
}

#[test]
fn refuses_a_reused_or_reserved_id() {
    let twice = r#"
        [[workspace]]
        id = "a"
        name = "A"
        match = ["*@a.com"]

        [[workspace]]
        id = "a"
        name = "Again"
        match = ["*@b.com"]
    "#;
    assert!(matches!(Router::from_toml(twice), Err(ConfigError::DuplicateWorkspace(_))));

    let reserved = format!("[[workspace]]\nid = \"{UNSORTED_WORKSPACE}\"\nname = \"U\"\nmatch = [\"*@a.com\"]\n");
    assert!(matches!(Router::from_toml(&reserved), Err(ConfigError::ReservedWorkspace(_))));
}

#[test]
fn names_the_workspace_with_a_bad_pattern() {
    let result = Router::from_toml("[[workspace]]\nid = \"a\"\nname = \"A\"\nmatch = [\"acme.com\"]\n");
    match result {
        Err(error @ ConfigError::Pattern { .. }) => assert!(error.to_string().starts_with("workspace `a`")),
        other => unreachable!("expected a pattern error, got {other:?}"),
    }
}

#[test]
fn refuses_an_unknown_field() {
    let result = Router::from_toml("[[workspace]]\nid = \"a\"\nname = \"A\"\nmatch = [\"*@a.com\"]\ncolour = \"red\"\n");
    assert!(matches!(result, Err(ConfigError::Parse(_))));
}
