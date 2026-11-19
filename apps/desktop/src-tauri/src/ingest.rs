//! Taking mail in: parse it, route it, run the rules, store it. Every source (a file today, the Cloudflare Worker and IMAP next)
//! goes through [`ingest`], so a message is placed the same way whichever door it came through.

use buun_mail_message::{MessageError, body_text, is_mbox, parse, split_mbox, thread_ids};
use buun_mail_routing::{Address, Envelope, Router};
use buun_mail_rules::{CheckedRule, Facts, evaluate};
use buun_mail_store::{Activity, Inserted, MessageRecord, Placement, Shelf, Store, StoreError};
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

/// A message that was new: what was stored, and whether a rule asked for it to stay quiet.
#[derive(Debug, Clone)]
pub struct Arrived {
    /// The stored record, after rules.
    pub record: MessageRecord,
    /// True when a rule keeps it out of notifications.
    pub quiet: bool,
}

/// Parses, routes, runs the rules on and stores one message. Returns what was stored when it was new, `None` when the
/// same bytes were already stored, so callers announce only what actually arrived.
///
/// # Errors
///
/// [`IngestError`] when the message cannot be read or routed, or the store fails.
pub fn ingest(incoming: Incoming<'_>, router: &Router, rules: &[CheckedRule], store: &Store) -> Result<Option<Arrived>, IngestError> {
    let parsed = parse(incoming.raw, incoming.received_at)?;
    let to = incoming.envelope_to.map_or_else(|| parsed.recipient.clone(), str::to_lowercase);
    let envelope = Envelope {
        from: Address::parse(&parsed.from).map_err(|_| IngestError::Address(parsed.from.clone()))?,
        to: Address::parse(&to).map_err(|_| IngestError::Address(to.clone()))?,
    };
    let route = router.route(&envelope);
    let placed_by_routing = Placement { workspace: route.workspace.as_str().to_owned(), folder: route.folder.map(|folder| folder.as_str().to_owned()) };
    let outcome = evaluate(
        rules,
        &Facts {
            workspace: &placed_by_routing.workspace,
            folder: placed_by_routing.folder.as_deref(),
            from: &envelope.from,
            to: &envelope.to,
            subject: &parsed.subject,
        },
    );
    let record = MessageRecord {
        id: parsed.id,
        placement: outcome.moved_to.clone().map_or(placed_by_routing, |(workspace, folder)| Placement { workspace, folder }),
        matched: route.matched.map(ToString::to_string),
        folder_matched: route.folder_matched.map(ToString::to_string),
        from_name: parsed.from_name,
        from: parsed.from,
        to,
        subject: parsed.subject,
        preview: parsed.preview,
        sent_at: parsed.sent_at,
        message_id: parsed.message_id,
        unread: !outcome.mark_read,
        starred: false,
        shelf: Shelf::Active,
        tags: outcome.tags.clone(),
        thread_id: None,
        thread_size: 1,
    };
    if store.insert(&record, incoming.raw)? == Inserted::Duplicate {
        return Ok(None);
    }
    file_for_reading(store, &record, incoming.raw)?;
    for name in &outcome.fired {
        store.log(&Activity {
            at: incoming.received_at,
            actor: format!("rule:{name}"),
            action: "apply".to_owned(),
            detail: format!("\"{}\"", record.subject),
        })?;
    }
    Ok(Some(Arrived { record, quiet: outcome.quiet }))
}

/// A file's messages: every message in an `.mbox`, or the file itself when it is one message.
#[must_use]
pub fn messages_in(bytes: &[u8]) -> Vec<Vec<u8>> {
    if is_mbox(bytes) { split_mbox(bytes) } else { vec![bytes.to_vec()] }
}

/// Puts a newly stored message in its conversation and indexes its words for search. Every door mail comes through,
/// sent mail included, calls this once the message is stored.
///
/// # Errors
///
/// [`StoreError`] when the index cannot be written.
pub fn file_for_reading(store: &Store, record: &MessageRecord, raw: &[u8]) -> Result<(), StoreError> {
    let ids = thread_ids(raw);
    store.link(&record.id, ids.message_id.as_deref(), &ids.parents())?;
    store.index_text(&record.id, &record.subject, &format!("{} {} {}", record.from_name, record.from, record.to), &body_text(raw))
}
