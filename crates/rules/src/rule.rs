//! A rule as people and agents write it, and the checked form the engine runs.

use buun_mail_routing::Pattern;
use serde::{Deserialize, Serialize};

use crate::error::RuleError;

/// One rule. Serialised as JSON with camelCase fields; this is the shape agents send over MCP.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Rule {
    /// A stable id. Left empty when an agent or a person adds a rule; the app fills it in.
    #[serde(default)]
    pub id: String,
    /// What the rule is for, in a few words: "Stripe receipts".
    pub name: String,
    /// Off rules are kept but never run.
    #[serde(default = "enabled_by_default")]
    pub enabled: bool,
    /// Which mail it applies to.
    pub when: When,
    /// What it does to that mail, in order.
    pub actions: Vec<Action>,
}

/// The conditions. Each one given must hold; leaving one out means it does not matter.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct When {
    /// The workspace routing placed it in, by id.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace: Option<String>,
    /// The sender: `billing@stripe.com` or `*@stripe.com`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
    /// The address it was delivered to: `sales@acme.com` or `*@preview.acme.com`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub to: Option<String>,
    /// Text the subject contains, ignoring case.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subject_contains: Option<String>,
    /// Text the message's words contain, ignoring case: "new subscription", "order #".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub body_contains: Option<String>,
    /// A tag it carries: one an earlier rule added, or one a person or an agent adds later (which can then alert).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tagged: Option<String>,
}

/// What a rule does.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub enum Action {
    /// Adds a tag.
    Tag {
        /// The tag, such as `receipt`.
        tag: String,
    },
    /// Moves it to another folder, or another workspace. Leaving `workspace` out keeps the routed one; leaving
    /// `folder` out means the inbox.
    Move {
        /// The workspace id to move to.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        workspace: Option<String>,
        /// The folder name, or none for the inbox.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        folder: Option<String>,
    },
    /// Marks it read.
    MarkRead,
    /// Keeps it quiet: no toast, no desktop notification.
    Quiet,
    /// Puts it straight in the trash: a blocked sender.
    Trash,
    /// Saves its attachments (not pictures shown in its text) into a folder on this computer as it arrives.
    SaveAttachments {
        /// The folder, as an absolute path.
        folder: String,
    },
    /// Sends an alert through one of the app's alert channels (Slack, a text, an email), by the channel's id. Only mail
    /// that arrives alerts; re-running rules over stored mail never does.
    Alert {
        /// The alert channel's id.
        channel: String,
    },
}

fn enabled_by_default() -> bool {
    true
}

impl Rule {
    /// A new, enabled rule with no id yet.
    #[must_use]
    pub fn new(name: &str, when: When, actions: Vec<Action>) -> Self {
        Self { id: String::new(), name: name.to_owned(), enabled: true, when, actions }
    }

    /// Reads a rule from JSON.
    ///
    /// # Errors
    ///
    /// [`RuleError::Json`] when the JSON is not a rule.
    pub fn from_json(json: &str) -> Result<Self, RuleError> {
        Ok(serde_json::from_str(json)?)
    }

    /// The rule as JSON, for the store.
    #[must_use]
    pub fn to_json(&self) -> String {
        // A Rule is strings, booleans and enums only, so serialising it cannot fail.
        serde_json::to_string(self).unwrap_or_default()
    }

    /// Checks the rule and parses its patterns, ready to run.
    ///
    /// # Errors
    ///
    /// [`RuleError`] for a missing name, no conditions, no actions, an unreadable pattern or an empty tag.
    pub fn check(&self) -> Result<CheckedRule, RuleError> {
        let name = self.name.trim();
        if name.is_empty() {
            return Err(RuleError::NoName);
        }
        let when = &self.when;
        let empty = |text: &Option<String>| text.as_deref().is_none_or(|text| text.trim().is_empty());
        if when.workspace.is_none()
            && when.from.is_none()
            && when.to.is_none()
            && empty(&when.subject_contains)
            && empty(&when.body_contains)
            && empty(&when.tagged)
        {
            return Err(RuleError::NoCondition(name.to_owned()));
        }
        if self.actions.is_empty() {
            return Err(RuleError::NoAction(name.to_owned()));
        }
        if self.actions.iter().any(|action| matches!(action, Action::Tag { tag } if tag.trim().is_empty())) {
            return Err(RuleError::EmptyTag(name.to_owned()));
        }
        if self.actions.iter().any(|action| matches!(action, Action::SaveAttachments { folder } if !std::path::Path::new(folder.trim()).is_absolute())) {
            return Err(RuleError::NoFolder(name.to_owned()));
        }
        if self.actions.iter().any(|action| matches!(action, Action::Alert { channel } if channel.trim().is_empty())) {
            return Err(RuleError::NoChannel(name.to_owned()));
        }
        let pattern =
            |raw: &Option<String>| raw.as_deref().map(Pattern::parse).transpose().map_err(|source| RuleError::Pattern { rule: name.to_owned(), source });
        Ok(CheckedRule {
            rule: self.clone(),
            from: pattern(&when.from)?,
            to: pattern(&when.to)?,
            subject: when.subject_contains.as_deref().map(str::trim).filter(|text| !text.is_empty()).map(str::to_lowercase),
            body: when.body_contains.as_deref().map(str::trim).filter(|text| !text.is_empty()).map(str::to_lowercase),
            tagged: when.tagged.as_deref().map(str::trim).filter(|text| !text.is_empty()).map(str::to_owned),
        })
    }
}

/// A rule that passed [`Rule::check`], with its patterns parsed.
#[derive(Debug, Clone)]
pub struct CheckedRule {
    pub(crate) rule: Rule,
    pub(crate) from: Option<Pattern>,
    pub(crate) to: Option<Pattern>,
    pub(crate) subject: Option<String>,
    pub(crate) body: Option<String>,
    pub(crate) tagged: Option<String>,
}

impl CheckedRule {
    /// The rule as written.
    #[must_use]
    pub const fn rule(&self) -> &Rule {
        &self.rule
    }

    /// True when it looks at the message's words, so a caller knows to read them.
    #[must_use]
    pub const fn needs_body(&self) -> bool {
        self.body.is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tag(tag: &str) -> Vec<Action> {
        vec![Action::Tag { tag: tag.to_owned() }]
    }

    #[test]
    fn reads_the_json_agents_send() -> Result<(), RuleError> {
        let rule = Rule::from_json(r#"{"name":"Receipts","when":{"from":"*@stripe.com"},"actions":[{"type":"tag","tag":"receipt"},{"type":"markRead"}]}"#)?;
        assert!(rule.enabled);
        assert_eq!(rule.actions, [Action::Tag { tag: "receipt".to_owned() }, Action::MarkRead]);
        assert_eq!(Rule::from_json(&rule.to_json())?, rule);
        Ok(())
    }

    #[test]
    fn refuses_rules_that_match_everything_or_do_nothing() {
        assert!(matches!(Rule::new("All", When::default(), tag("x")).check(), Err(RuleError::NoCondition(_))));
        let when = When { from: Some("*@a.com".to_owned()), ..When::default() };
        assert!(matches!(Rule::new("Nothing", when.clone(), vec![]).check(), Err(RuleError::NoAction(_))));
        assert!(matches!(Rule::new(" ", when.clone(), tag("x")).check(), Err(RuleError::NoName)));
        assert!(matches!(Rule::new("Blank tag", when, tag(" ")).check(), Err(RuleError::EmptyTag(_))));
    }

    #[test]
    fn names_the_rule_with_a_bad_pattern() {
        let rule = Rule::new("Bad", When { to: Some("acme.com".to_owned()), ..When::default() }, tag("x"));
        let error = rule.check().err().map(|error| error.to_string()).unwrap_or_default();
        assert!(error.starts_with("rule `Bad`"), "{error}");
    }

    #[test]
    fn refuses_unknown_fields() {
        assert!(Rule::from_json(r#"{"name":"x","when":{"sender":"a@b.com"},"actions":[]}"#).is_err());
    }
}
