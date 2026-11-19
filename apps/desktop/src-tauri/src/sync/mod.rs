//! Mail from the Buun Mail Gateway (`buungroup-app/apps/mail-gateway`): the gateway receives mail for your domains
//! through Cloudflare Email Routing and holds it; this module collects it, takes it in through the one ingest path
//! with its exact envelope recipient, and acknowledges it so the gateway forgets it.
//!
//! - `gateway`: the HTTP client for the gateway's `/v1` API
//! - `settings`: the gateway's address and token, saved on this computer
//! - `service`: the background loop that checks every half minute, or at once when asked

mod gateway;
mod service;
mod settings;
#[cfg(test)]
mod tests;

pub use gateway::{AvailableZone, OwnedDomain};
pub use service::{GatewayStatusDto, SyncService};
