//! What sending needs from the mailbox: the ids a reply threads under, the copy kept in Sent, and recipients to suggest.

use buun_mail_message::{ThreadIds, parse, thread_ids};
use buun_mail_routing::{Address, Envelope};
use buun_mail_store::{Inserted, Placement};

use super::{Actor, Mailbox, log, unix_now};
use crate::dto::{ContactDto, MessageDto};
use crate::error::AppError;

/// The folder sent mail is kept in, in the workspace its sender address belongs to.
pub const SENT_FOLDER: &str = "Sent";

/// How many recipients a suggestion offers at most.
const SUGGESTIONS: usize = 8;

impl Mailbox {
    /// The ids a reply to message `id` carries.
    ///
    /// # Errors
    ///
    /// [`AppError`] for an unknown id, or when the store cannot be read.
    pub fn thread_of(&self, id: &str) -> Result<ThreadIds, AppError> {
        Ok(thread_ids(&self.store.lock()?.raw(id)?))
    }

    /// Keeps a copy of a sent message in Sent, in the workspace the sender address is routed to, already read.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the copy cannot be read back or stored.
    pub fn keep_sent(&self, raw: &[u8], from: &str) -> Result<MessageDto, AppError> {
        let now = unix_now();
        let parsed = parse(raw, now).map_err(|error| AppError::Unreadable(error.to_string()))?;
        let address = Address::parse(from).map_err(|_| AppError::Unreadable(format!("{from} is not an address")))?;
        let workspace = self.router.read()?.route(&Envelope { from: address.clone(), to: address }).workspace.as_str().to_owned();
        let to = parsed.recipient.clone();
        let record = buun_mail_store::MessageRecord {
            id: parsed.id,
            placement: Placement { workspace, folder: Some(SENT_FOLDER.to_owned()) },
            matched: None,
            folder_matched: None,
            from_name: parsed.from_name,
            from: parsed.from,
            to,
            subject: parsed.subject,
            preview: parsed.preview,
            sent_at: parsed.sent_at,
            message_id: parsed.message_id,
            unread: false,
            starred: false,
            shelf: buun_mail_store::Shelf::Active,
            tags: Vec::new(),
        };
        let store = self.store.lock()?;
        if store.insert(&record, raw)? == Inserted::New {
            log(&store, &Actor::You, "send", format!("\"{}\" to {}", record.subject, record.to))?;
        }
        Ok(record.into())
    }

    /// People to suggest as recipients, whose name or address holds `query`, most written-to first.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the store cannot be read.
    pub fn contacts(&self, query: &str) -> Result<Vec<ContactDto>, AppError> {
        Ok(self
            .store
            .lock()?
            .contacts(query.trim(), SUGGESTIONS)?
            .into_iter()
            .map(|(name, address, _)| ContactDto { name: (!name.is_empty() && name != address).then_some(name), address })
            .collect())
    }
}
