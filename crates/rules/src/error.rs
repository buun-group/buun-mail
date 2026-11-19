//! The ways a rule can be wrong. Each says what to fix, for a person in Settings and an agent alike.

use buun_mail_routing::AddressError;
use thiserror::Error;

/// Why a rule cannot be used.
#[derive(Debug, Error)]
pub enum RuleError {
    /// The rule has no name.
    #[error("a rule needs a name")]
    NoName,
    /// The rule has no conditions, so it would match every message.
    #[error("rule `{0}` needs at least one condition: workspace, from, to or subjectContains")]
    NoCondition(String),
    /// The rule does nothing.
    #[error("rule `{0}` needs at least one action: tag, move, markRead or quiet")]
    NoAction(String),
    /// A `from` or `to` pattern cannot be read.
    #[error("rule `{rule}`: {source}")]
    Pattern {
        /// The rule's name.
        rule: String,
        /// What is wrong with the pattern.
        source: AddressError,
    },
    /// A tag is empty.
    #[error("rule `{0}` has an empty tag")]
    EmptyTag(String),
    /// The JSON is not a rule.
    #[error("that is not a rule: {0}")]
    Json(#[from] serde_json::Error),
}
