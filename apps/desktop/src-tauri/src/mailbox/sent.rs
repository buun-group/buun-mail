//! What sending and reading across folders need from the mailbox: the ids a reply threads under, the copy kept in
//! Sent, recipients to suggest, conversations, search of all mail, and catching up older mail on both.

use buun_mail_message::{ThreadIds, parse, thread_ids};
use buun_mail_routing::{Address, Envelope};
use buun_mail_store::{Inserted, Placement};

use super::{Actor, Mailbox, log, unix_now};
use crate::dto::{ContactDto, MessageDto};
use crate::error::AppError;
use crate::ingest::file_for_reading;

/// The folder sent mail is kept in, in the workspace its sender address belongs to.
pub const SENT_FOLDER: &str = "Sent";

/// How many recipients a suggestion offers at most.
const SUGGESTIONS: usize = 8;

/// How many results a search of all mail returns at most.
const SEARCH_RESULTS: usize = 200;

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
            thread_id: None,
            thread_size: 1,
        };
        let store = self.store.lock()?;
        if store.insert(&record, raw)? == Inserted::New {
            file_for_reading(&store, &record, raw)?;
            log(&store, &Actor::You, "send", format!("\"{}\" to {}", record.subject, record.to))?;
        }
        Ok(store.get(&record.id)?.into())
    }

    /// Every message in a conversation outside the trash, oldest first.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the store cannot be read.
    pub fn thread(&self, thread_id: &str) -> Result<Vec<MessageDto>, AppError> {
        Ok(self.store.lock()?.thread(thread_id)?.into_iter().map(MessageDto::from).collect())
    }

    /// Messages anywhere outside the trash whose subject, people or text hold every word of `query`.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the store cannot be read.
    pub fn search_all(&self, query: &str) -> Result<Vec<MessageDto>, AppError> {
        Ok(self.store.lock()?.search_text(query, SEARCH_RESULTS)?.into_iter().map(MessageDto::from).collect())
    }

    /// Links and indexes up to `batch` messages stored before conversations and search existed. Returns how many it
    /// did; the caller repeats until none are left. Each batch takes the lock briefly, so mail keeps flowing.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the store cannot be read or written.
    pub fn catch_up(&self, batch: usize) -> Result<usize, AppError> {
        let store = self.store.lock()?;
        let ids = store.unlinked(batch)?;
        for id in &ids {
            let record = store.get(id)?;
            let raw = store.raw(id).unwrap_or_default();
            file_for_reading(&store, &record, &raw)?;
        }
        Ok(ids.len())
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
