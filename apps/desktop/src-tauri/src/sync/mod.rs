//! Mail from Buun Mail Gateways (`buungroup-app/apps/mail-gateway`): the gateway receives mail for your domains
//! through Cloudflare Email Routing (or a relay in another account) and holds it; this module collects it from every
//! connected gateway, takes it in through the one ingest path
//! with its exact envelope recipient, and acknowledges it so the gateway forgets it.
//!
//! - `gateway`: the HTTP client for the gateway's `/v1` API
//! - `settings`: every gateway's name, address and token, saved on this computer
//! - `service`: the background loop that checks every gateway every half minute, or at once when asked

mod gateway;
mod service;
mod settings;
#[cfg(test)]
mod tests;

pub use gateway::{AvailableZone, DomainRoute, OwnedDomain};
pub use service::{CheckReportDto, GatewayStatusDto, SyncService};
