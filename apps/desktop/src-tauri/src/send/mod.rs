//! Sending mail through a connected service, Resend first:
//!
//! - `settings`: the senders saved in `senders.json`, readable by this user only
//! - `resend`: the client for Resend's API (its domains, and sending one message)
//! - `smtp`: sending through any mail server over SMTP
//! - `service`: which sender can send as which address, and sending a draft, keeping a copy in Sent

mod resend;
mod service;
mod settings;
mod smtp;

pub use service::{ContactInput, DraftDto, SendFailure, SendService, SendableDto, SenderDto};
pub use smtp::{Security, SmtpServer};
