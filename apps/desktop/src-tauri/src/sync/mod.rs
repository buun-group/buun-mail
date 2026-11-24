//! Mail from Buun Mail Gateways (`apps/gateway`): the gateway receives mail for your domains through Cloudflare Email
//! Routing (or a relay in another account) and holds it; this module collects it from every connected gateway, takes it
//! in through the one ingest path with its exact envelope recipient, and acknowledges it so the gateway forgets it.
//!
//! - `gateway`: the HTTP client for the gateway's `/v1` API
//! - `push`: the WebSocket that says when mail lands, kept known alive with a ping and its pong
//! - `collect`: taking in one gateway's waiting mail, with the collect call or the older list, fetch and acknowledge
//! - `settings`: every gateway's name, address and token, saved on this computer
//! - `service`: the event-driven loop: collects on an arrival, a (re)connection, the app starting and Check now, with
//!   an hourly safety check (every five minutes while a socket is down)

mod collect;
mod gateway;
mod push;
mod service;
mod settings;
#[cfg(test)]
mod tests;

pub use gateway::{AvailableZone, DomainRoute, OwnedDomain};
pub use service::{CheckReportDto, GatewayStatusDto, SyncService};
