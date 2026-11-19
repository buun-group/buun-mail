//! Collecting mail from IMAP mailboxes: Gmail and iCloud with app passwords, Fastmail, Zoho, Proton Mail Bridge, or any
//! other server.
//!
//! - `client`: a small IMAP client over TLS, STARTTLS, or plain text to this computer
//! - `settings`: the mailboxes saved in `imap.json`, readable by this user only
//! - `service`: the two-minute check of every mailbox, taking in what is new without marking it read there

mod client;
mod service;
mod settings;
#[cfg(test)]
mod tests;

pub use client::ImapSecurity;
pub use service::{ImapAccountDto, ImapService};
