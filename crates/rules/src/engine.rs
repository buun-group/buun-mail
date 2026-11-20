//! Running rules on one message.

use buun_mail_routing::Address;

use crate::rule::{Action, CheckedRule};

/// What a rule can see about a message: where routing put it, who sent it, who it was for, and its subject.
#[derive(Debug, Clone, Copy)]
pub struct Facts<'a> {
    /// The routed workspace id.
    pub workspace: &'a str,
    /// The routed folder, `None` for the inbox.
    pub folder: Option<&'a str>,
    /// The sender.
    pub from: &'a Address,
    /// The address it was delivered to.
    pub to: &'a Address,
    /// The subject.
    pub subject: &'a str,
    /// The message's words, lowercased; empty when not read (a rule on the words then does not match).
    pub body: &'a str,
    /// The tags it already carries.
    pub tags: &'a [String],
}

/// What the rules decided, all together.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Outcome {
    /// Tags to add, in rule order, without repeats.
    pub tags: Vec<String>,
    /// A new place, when a rule moved it: the workspace and the folder (`None` for the inbox).
    pub moved_to: Option<(String, Option<String>)>,
    /// True when a rule marked it read.
    pub mark_read: bool,
    /// True when a rule keeps it quiet.
    pub quiet: bool,
    /// True when a rule puts it in the trash.
    pub trash: bool,
    /// The alert channels to send to, by id, in rule order, without repeats.
    pub alerts: Vec<String>,
    /// The names of the rules that ran, for the activity log.
    pub fired: Vec<String>,
}

/// Runs every enabled rule that matches, in order. A later move wins over an earlier one.
#[must_use]
pub fn evaluate(rules: &[CheckedRule], facts: &Facts<'_>) -> Outcome {
    let mut outcome = Outcome::default();
    for checked in rules {
        // In order, so a rule on a tag sees the tags earlier rules added.
        if !checked.rule.enabled || !matches(checked, facts, &outcome.tags) {
            continue;
        }
        outcome.fired.push(checked.rule.name.clone());
        for action in &checked.rule.actions {
            match action {
                Action::Tag { tag } => {
                    let tag = tag.trim().to_owned();
                    if !outcome.tags.contains(&tag) {
                        outcome.tags.push(tag);
                    }
                }
                Action::Move { workspace, folder } => {
                    let workspace = workspace
                        .clone()
                        .unwrap_or_else(|| outcome.moved_to.as_ref().map_or_else(|| facts.workspace.to_owned(), |(current, _)| current.clone()));
                    outcome.moved_to = Some((workspace, folder.clone()));
                }
                Action::MarkRead => outcome.mark_read = true,
                Action::Quiet => outcome.quiet = true,
                Action::Trash => outcome.trash = true,
                Action::Alert { channel } => {
                    if !outcome.alerts.contains(channel) {
                        outcome.alerts.push(channel.clone());
                    }
                }
            }
        }
    }
    outcome
}

/// True when every condition the rule gives holds for this message, `added` being the tags earlier rules gave it.
fn matches(checked: &CheckedRule, facts: &Facts<'_>, added: &[String]) -> bool {
    checked.rule.when.workspace.as_deref().is_none_or(|workspace| workspace == facts.workspace)
        && checked.from.as_ref().is_none_or(|pattern| pattern.matches(facts.from))
        && checked.to.as_ref().is_none_or(|pattern| pattern.matches(facts.to))
        && checked.subject.as_deref().is_none_or(|text| facts.subject.to_lowercase().contains(text))
        && checked.body.as_deref().is_none_or(|text| facts.body.contains(text))
        && checked.tagged.as_deref().is_none_or(|tag| facts.tags.iter().chain(added).any(|have| have.eq_ignore_ascii_case(tag)))
}

/// The alert channels to tell when a person or an agent adds `tag` to a stored message: the alerts of enabled rules on
/// that tag whose other conditions hold. `facts.tags` holds the message's tags with the new one.
#[must_use]
pub fn alerts_for_tag(rules: &[CheckedRule], tag: &str, facts: &Facts<'_>) -> Vec<String> {
    let mut channels: Vec<String> = Vec::new();
    for checked in rules.iter().filter(|checked| {
        checked.rule.enabled && checked.tagged.as_deref().is_some_and(|wanted| wanted.eq_ignore_ascii_case(tag)) && matches(checked, facts, &[])
    }) {
        for action in &checked.rule.actions {
            if let Action::Alert { channel } = action
                && !channels.contains(channel)
            {
                channels.push(channel.clone());
            }
        }
    }
    channels
}

#[cfg(test)]
mod tests {
    use buun_mail_routing::Address;

    use super::*;
    use crate::rule::{Rule, When};

    fn address(raw: &str) -> Address {
        Address::parse(raw).unwrap_or_else(|error| unreachable!("test address {raw}: {error}"))
    }

    fn checked(rule: &Rule) -> CheckedRule {
        rule.check().unwrap_or_else(|error| unreachable!("test rule: {error}"))
    }

    fn run(rules: &[CheckedRule], from: &str, to: &str, subject: &str) -> Outcome {
        let (from, to) = (address(from), address(to));
        evaluate(rules, &Facts { workspace: "acme", folder: None, from: &from, to: &to, subject, body: "", tags: &[] })
    }

    #[test]
    fn every_condition_must_hold() {
        let rules = [checked(&Rule::new(
            "Preview invoices",
            When { to: Some("*@preview.acme.com".to_owned()), subject_contains: Some("Invoice".to_owned()), ..When::default() },
            vec![Action::Tag { tag: "preview".to_owned() }],
        ))];
        assert_eq!(run(&rules, "a@b.com", "x@preview.acme.com", "Your invoice").tags, ["preview"]);
        assert_eq!(run(&rules, "a@b.com", "x@acme.com", "Your invoice").tags, Vec::<String>::new());
        assert_eq!(run(&rules, "a@b.com", "x@preview.acme.com", "Hello").fired, Vec::<String>::new());
    }

    #[test]
    fn runs_every_match_in_order_and_the_last_move_wins() {
        let stripe = When { from: Some("*@stripe.com".to_owned()), ..When::default() };
        let rules = [
            checked(&Rule::new(
                "Tag",
                stripe.clone(),
                vec![Action::Tag { tag: "money".to_owned() }, Action::Move { workspace: None, folder: Some("Receipts".to_owned()) }],
            )),
            checked(&Rule::new(
                "Quiet",
                stripe.clone(),
                vec![Action::Quiet, Action::MarkRead, Action::Tag { tag: "money".to_owned() }, Action::Alert { channel: "slack-1".to_owned() }],
            )),
            checked(&Rule::new("Elsewhere", stripe, vec![Action::Move { workspace: Some("personal".to_owned()), folder: None }])),
        ];
        let outcome = run(&rules, "receipts@stripe.com", "me@acme.com", "Receipt");
        assert_eq!(outcome.tags, ["money"]);
        assert_eq!(outcome.moved_to, Some(("personal".to_owned(), None)));
        assert!(outcome.quiet && outcome.mark_read);
        assert_eq!(outcome.alerts, ["slack-1"]);
        assert_eq!(outcome.fired, ["Tag", "Quiet", "Elsewhere"]);
    }

    #[test]
    fn matches_the_words_and_a_tag_an_earlier_rule_added() {
        let sale =
            Rule::new("Sale", When { body_contains: Some("New Subscription".to_owned()), ..When::default() }, vec![Action::Tag { tag: "sale".to_owned() }]);
        let alert = Rule::new("Tell me", When { tagged: Some("sale".to_owned()), ..When::default() }, vec![Action::Alert { channel: "slack-1".to_owned() }]);
        let rules = [checked(&sale), checked(&alert)];
        let (from, to) = (address("a@stripe.com"), address("billing@gunspec.io"));
        let facts = |body| Facts { workspace: "gunspec", folder: None, from: &from, to: &to, subject: "Receipt", body, tags: &[] };
        assert_eq!(evaluate(&rules, &facts("a new subscription to pro")).alerts, ["slack-1"]);
        assert_eq!(evaluate(&rules, &facts("a refund")).alerts, Vec::<String>::new());
        let tagged = ["sale".to_owned()];
        let later = Facts { tags: &tagged, ..facts("") };
        assert_eq!(alerts_for_tag(&rules, "sale", &later), ["slack-1"]);
        assert_eq!(alerts_for_tag(&rules, "other", &later), Vec::<String>::new());
    }

    #[test]
    fn skips_disabled_rules() {
        let mut rule = Rule::new("Off", When { workspace: Some("acme".to_owned()), ..When::default() }, vec![Action::MarkRead]);
        rule.enabled = false;
        assert!(!run(&[checked(&rule)], "a@b.com", "x@acme.com", "Hi").mark_read);
    }
}
