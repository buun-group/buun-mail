//! Rules that run on mail as it arrives, after routing has picked its workspace and folder.
//!
//! A rule reads like a sentence a person would write: *when* mail is in this workspace, from this sender, to this
//! address or with this in its subject, *then* tag it, move it, mark it read or keep it quiet. Every condition given
//! must hold; every enabled rule that matches runs, in order, so a later move wins over an earlier one.
//!
//! Rules are plain data ([`Rule`], JSON on disk) so a person in Settings and an agent over MCP edit the same thing.
//! [`Rule::check`] validates one before it is used.
//!
//! ```
//! use buun_mail_rules::{Action, Facts, Rule, When, evaluate};
//! use buun_mail_routing::Address;
//!
//! let rule = Rule::new("Stripe receipts", When { from: Some("*@stripe.com".into()), ..When::default() }, vec![Action::Tag { tag: "receipt".into() }]);
//! let checked = [rule.check()?];
//! let from = Address::parse("receipts@stripe.com")?;
//! let to = Address::parse("me@acme.com")?;
//! let outcome = evaluate(&checked, &Facts { workspace: "acme", folder: None, from: &from, to: &to, subject: "Your receipt" });
//! assert_eq!(outcome.tags, ["receipt"]);
//! # Ok::<(), Box<dyn std::error::Error>>(())
//! ```

mod engine;
mod error;
mod rule;

pub use engine::{Facts, Outcome, evaluate};
pub use error::RuleError;
pub use rule::{Action, CheckedRule, Rule, When};
