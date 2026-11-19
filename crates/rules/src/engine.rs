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
    /// The names of the rules that ran, for the activity log.
    pub fired: Vec<String>,
}

/// Runs every enabled rule that matches, in order. A later move wins over an earlier one.
#[must_use]
pub fn evaluate(rules: &[CheckedRule], facts: &Facts<'_>) -> Outcome {
    let mut outcome = Outcome::default();
    for checked in rules.iter().filter(|checked| checked.rule.enabled && matches(checked, facts)) {
        outcome.fired.push(checked.rule.name.clone());
        for action in &checked.rule.then {
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
            }
        }
    }
    outcome
}

/// True when every condition the rule gives holds for this message.
fn matches(checked: &CheckedRule, facts: &Facts<'_>) -> bool {
    checked.rule.when.workspace.as_deref().is_none_or(|workspace| workspace == facts.workspace)
        && checked.from.as_ref().is_none_or(|pattern| pattern.matches(facts.from))
        && checked.to.as_ref().is_none_or(|pattern| pattern.matches(facts.to))
        && checked.subject.as_deref().is_none_or(|text| facts.subject.to_lowercase().contains(text))
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
        evaluate(rules, &Facts { workspace: "acme", folder: None, from: &from, to: &to, subject })
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
            checked(&Rule::new("Quiet", stripe.clone(), vec![Action::Quiet, Action::MarkRead, Action::Tag { tag: "money".to_owned() }])),
            checked(&Rule::new("Elsewhere", stripe, vec![Action::Move { workspace: Some("personal".to_owned()), folder: None }])),
        ];
        let outcome = run(&rules, "receipts@stripe.com", "me@acme.com", "Receipt");
        assert_eq!(outcome.tags, ["money"]);
        assert_eq!(outcome.moved_to, Some(("personal".to_owned(), None)));
        assert!(outcome.quiet && outcome.mark_read);
        assert_eq!(outcome.fired, ["Tag", "Quiet", "Elsewhere"]);
    }

    #[test]
    fn skips_disabled_rules() {
        let mut rule = Rule::new("Off", When { workspace: Some("acme".to_owned()), ..When::default() }, vec![Action::MarkRead]);
        rule.enabled = false;
        assert!(!run(&[checked(&rule)], "a@b.com", "x@acme.com", "Hi").mark_read);
    }
}
