//! dissolve.email: sign in with OAuth, and its disposable inboxes become a workspace with one folder per inbox. New mail
//! is collected from the `/v1` API, inboxes can be made, extended and burned from the app, and when an inbox ends on
//! dissolve its mail here goes too, unless the person chose to keep it. Off until someone connects an account.
//!
//! - `oauth`: discovery, registration, PKCE, the way back from the browser (loopback or app link), tokens
//! - `api`: the `/v1` calls this app makes
//! - `settings`: the account, its tokens and what has been collected, in `dissolve.json`
//! - `stream`: the account stream (Pro and up), which says the moment mail lands
//! - `service`: connecting, the collection loop (the stream, the changes feed, or inbox by inbox), and the inbox actions

mod api;
mod manage;
mod manage_api;
mod oauth;
mod service;
mod settings;
mod stream;
#[cfg(test)]
mod tests;

pub use manage::IdentityRowDto;
pub use manage_api::Alias;
#[cfg(mobile)]
pub use oauth::deliver as deliver_app_link;
pub use service::{DissolveService, DissolveStatusDto, IdentityDto, MadeInboxDto};

/// The workspace id dissolve.email's mail is stored under. Never rename: it is stored with every message.
pub const WORKSPACE: &str = "dissolve";
