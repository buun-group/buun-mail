//! `CryptFlare`: sign in with OAuth (the token's audience is the REST API, limited to the organisation and workspaces
//! the person picked), choose a workspace and environment, and every new or changed dissolve.email agent identity is
//! saved there automatically, as one secret with the password and persona in its encrypted value. Off until someone
//! connects and turns saving on.
//!
//! - `settings`: the connection, where saves go, and the saves still waiting, in `cryptflare.json`
//! - `api`: the REST calls (whoami, workspaces, environments, create, rotate, settings)
//! - `entry`: an identity as a secret: its key, value and metadata
//! - `service`: connecting, choosing where saves go, and hearing identity changes
//! - `queue`: writing waiting saves, with retries, and refreshing the token one at a time

mod api;
mod entry;
mod queue;
mod service;
mod settings;
#[cfg(test)]
mod tests;

pub use service::{ChoiceDto, CryptFlareService, CryptFlareStatusDto, TargetDto};
