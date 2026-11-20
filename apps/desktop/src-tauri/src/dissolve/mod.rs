//! dissolve.email: sign in with OAuth, and its disposable inboxes become a workspace with one folder per inbox. New mail
//! is collected from the `/v1` API, inboxes can be made, extended and burned from the app, and when an inbox ends on
//! dissolve its mail here goes too, unless the person chose to keep it. Off until someone connects an account.
//!
//! - `oauth`: discovery, registration, PKCE, the one-shot loopback redirect, tokens
//! - `api`: the `/v1` calls this app makes
//! - `settings`: the account, its tokens and what has been collected, in `dissolve.json`
//! - `service`: connecting, the collection loop, and the inbox actions

mod api;
mod oauth;
mod service;
mod settings;
#[cfg(test)]
mod tests;

pub use service::{DissolveService, DissolveStatusDto, IdentityDto, MadeInboxDto};

/// The workspace id dissolve.email's mail is stored under. Never rename: it is stored with every message.
pub const WORKSPACE: &str = "dissolve";
