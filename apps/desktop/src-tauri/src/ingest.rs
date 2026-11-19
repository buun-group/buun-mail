//! Taking mail in: parse it, route it, store it. Every source (a file today, the Cloudflare Worker and IMAP next)
//! goes through [`ingest`], so a message is placed the same way whichever door it came through.

use buun_mail_message::{MessageError, is_mbox, parse, split_mbox};
use buun_mail_routing::{Address, Envelope, Router};
use buun_mail_store::{Inserted, MessageRecord, Placement, Store, StoreError};
use thiserror::Error;

/// Why one message was not taken in.
#[derive(Debug, Error)]
pub enum IngestError {
    /// It could not be read as mail.
    #[error(transparent)]
    Message(#[from] MessageError),
    /// Its sender or recipient is not a usable address.
    #[error("the address {0} cannot be routed")]
    Address(String),
    /// The store failed.
    #[error(transparent)]
    Store(#[from] StoreError),
}

/// One message's raw bytes and the envelope recipient, when the source knows it. The Cloudflare Worker does; a file
/// does not, and the recipient is then read from the delivery headers.
#[derive(Debug, Clone, Copy)]
pub struct Incoming<'a> {
    /// The raw RFC 5322 bytes.
    pub raw: &'a [u8],
    /// The envelope recipient, when known.
    pub envelope_to: Option<&'a str>,
    /// When it arrived, Unix seconds; stands in for a missing `Date:`.
    pub received_at: i64,
}

/// Parses, routes and stores one message.
///
/// # Errors
///
/// [`IngestError`] when the message cannot be read or routed, or the store fails.
pub fn ingest(incoming: Incoming<'_>, router: &Router, store: &Store) -> Result<Inserted, IngestError> {
    let parsed = parse(incoming.raw, incoming.received_at)?;
    let to = incoming.envelope_to.map_or_else(|| parsed.recipient.clone(), str::to_lowercase);
    let envelope = Envelope {
        from: Address::parse(&parsed.from).map_err(|_| IngestError::Address(parsed.from.clone()))?,
        to: Address::parse(&to).map_err(|_| IngestError::Address(to.clone()))?,
    };
    let route = router.route(&envelope);
    let record = MessageRecord {
        id: parsed.id,
        placement: Placement { workspace: route.workspace.as_str().to_owned(), folder: route.folder.map(|folder| folder.as_str().to_owned()) },
        matched: route.matched.map(ToString::to_string),
        folder_matched: route.folder_matched.map(ToString::to_string),
        from_name: parsed.from_name,
        from: parsed.from,
        to,
        subject: parsed.subject,
        preview: parsed.preview,
        sent_at: parsed.sent_at,
        message_id: parsed.message_id,
        unread: true,
    };
    Ok(store.insert(&record, incoming.raw)?)
}

/// A file's messages: every message in an `.mbox`, or the file itself when it is one message.
#[must_use]
pub fn messages_in(bytes: &[u8]) -> Vec<Vec<u8>> {
    if is_mbox(bytes) { split_mbox(bytes) } else { vec![bytes.to_vec()] }
}
