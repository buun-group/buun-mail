//! Sending mail through a connected service, Resend first:
//!
//! - `settings`: the senders saved in `senders.json`, readable by this user only
//! - `resend`: the client for Resend's API (its domains, and sending one message)
//! - `service`: which sender can send as which address, and sending a draft, keeping a copy in Sent

mod resend;
mod service;
mod settings;

pub use service::{DraftDto, SendFailure, SendService, SendableDto, SenderDto};
