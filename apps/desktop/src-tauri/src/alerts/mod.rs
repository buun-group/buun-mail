//! Alerts: a rule can tell you elsewhere when a particular mail arrives (a `GunSpec` subscription bought, a domain about to
//! expire), through Slack, Discord, ntfy, Telegram, a webhook, an email from one of your senders, or a text (Twilio).
//! Each channel's secret (a webhook address, a token) is sealed at rest like every other secret.
//!
//! - `settings`: the channels, in `alerts.json`
//! - `deliver`: what each kind sends, and where
//! - `service`: the channels, the worker that sends arriving mail's alerts, and Send a test

mod deliver;
mod service;
mod settings;
#[cfg(test)]
mod tests;

pub use service::{AlertChannelDto, AlertService};
pub use settings::AlertKind;
