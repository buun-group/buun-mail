//! Taking mail in: parse it, route it, run the rules, store it. Every source (a file today, the Cloudflare Worker and IMAP next)
//! goes through [`ingest`], so a message is placed the same way whichever door it came through.

use buun_mail_message::{MessageError, authentication, body_text, is_mbox, parse, split_mbox, thread_ids};
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
    /// Where the source says it belongs, such as a disposable inbox's own folder; routing is then skipped. Rules
    /// still run and may move it.
    pub placed: Option<&'a Placement>,
}

/// A message that was new: what was stored, and whether a rule asked for it to stay quiet.
#[derive(Debug, Clone)]
pub struct Arrived {
    /// The stored record, after rules.
    pub record: MessageRecord,
    /// True when a rule keeps it out of notifications.
    pub quiet: bool,
    /// Alert channels a rule asked to tell, by id.
    pub alerts: Vec<String>,
    /// Folders a rule asked to save its attachments into.
    pub save_to: Vec<String>,
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
    let (placed_by_routing, matched, folder_matched) = match incoming.placed {
        Some(placed) => (placed.clone(), None, None),
        None => (
            Placement { workspace: route.workspace.as_str().to_owned(), folder: route.folder.map(|folder| folder.as_str().to_owned()) },
            route.matched.map(ToString::to_string),
            route.folder_matched.map(ToString::to_string),
        ),
    };
    // A rule on the message's words reads them: lowercased, the head only, read once.
    let words = if rules.iter().any(CheckedRule::needs_body) { rule_words(incoming.raw) } else { String::new() };
    let outcome = evaluate(
        rules,
        &Facts {
            workspace: &placed_by_routing.workspace,
            folder: placed_by_routing.folder.as_deref(),
            from: &envelope.from,
            to: &envelope.to,
            subject: &parsed.subject,
            body: &words,
            tags: &[],
        },
    );
    let record = MessageRecord {
        id: parsed.id,
        placement: outcome.moved_to.clone().map_or(placed_by_routing, |(workspace, folder)| Placement { workspace, folder }),
        matched,
        folder_matched,
        from_name: parsed.from_name,
        from: parsed.from,
        to,
        subject: parsed.subject,
        preview: parsed.preview,
        sent_at: parsed.sent_at,
        message_id: parsed.message_id,
        unread: !outcome.mark_read,
        starred: false,
        shelf: if outcome.trash { Shelf::Trashed } else { Shelf::Active },
        tags: outcome.tags.clone(),
        thread_id: None,
        thread_size: 1,
        snoozed_until: None,
        size: i64::try_from(incoming.raw.len()).ok(),
        checks: authentication(incoming.raw).map(|found| found.summary()),
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
    // Mail a rule put in the trash (a blocked sender) is never announced.
    Ok(Some(Arrived { record, quiet: outcome.quiet || outcome.trash, alerts: outcome.alerts, save_to: outcome.save_to }))
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

/// How much of a message's words a rule looks at: plenty for any receipt or notice, bounded for a huge one.
const RULE_WORDS: usize = 64 * 1024;

/// A message's words as rules read them: the text body, lowercased, its head only.
#[must_use]
pub fn rule_words(raw: &[u8]) -> String {
    body_text(raw).chars().take(RULE_WORDS).collect::<String>().to_lowercase()
}
