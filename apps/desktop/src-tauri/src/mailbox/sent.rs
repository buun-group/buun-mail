//! What sending and reading across folders need from the mailbox: the ids a reply threads under, the copy kept in
//! Sent, recipients to suggest, conversations, search of all mail, and catching up older mail on both.

use buun_mail_message::{ThreadIds, parse, thread_ids};
use buun_mail_routing::{Address, Envelope};
use buun_mail_store::{Inserted, Placement};

use super::{Actor, Mailbox, log, unix_now};
use crate::dto::{ContactDto, KnownContactDto, MessageDto};
use crate::error::AppError;
use crate::ingest::file_for_reading;

/// The folder sent mail is kept in, in the workspace its sender address belongs to.
pub const SENT_FOLDER: &str = "Sent";

/// How many recipients a suggestion offers at most.
const SUGGESTIONS: usize = 8;

/// How many people the contacts page lists at most.
const CONTACTS_SHOWN: usize = 1_000;

/// How many results a search of all mail returns at most.
const SEARCH_RESULTS: usize = 200;

impl Mailbox {
    /// One stored message's original bytes, for carrying its attachments into a forward.
    ///
    /// # Errors
    ///
    /// [`AppError`] for an unknown id, or when the store cannot be read.
    pub fn raw_of(&self, id: &str) -> Result<Vec<u8>, AppError> {
        Ok(self.store.lock()?.raw(id)?)
    }

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
            snoozed_until: None,
            size: i64::try_from(raw.len()).ok(),
            checks: None,
        };
        let store = self.store.lock()?;
        if store.insert(&record, raw)? == Inserted::New {
            file_for_reading(&store, &record, raw)?;
            log(&store, &Actor::You, "send", format!("\"{}\" to {}", record.subject, record.to))?;
        }
        Ok(store.get(&record.id)?.into())
    }

    /// Everyone this mailbox knows, whose name or address holds `query`, most messages first, with their counts.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the store cannot be read.
    pub fn all_contacts(&self, query: &str) -> Result<Vec<KnownContactDto>, AppError> {
        Ok(self
            .store
            .lock()?
            .contacts(query.trim(), CONTACTS_SHOWN)?
            .into_iter()
            .map(|(name, address, messages, latest)| KnownContactDto {
                name: (!name.is_empty() && name != address).then_some(name),
                address,
                messages,
                latest: buun_mail_message::rfc3339(latest),
            })
            .collect())
    }

    /// The note on a message's conversation, if any.
    ///
    /// # Errors
    ///
    /// [`AppError`] for an unknown id, or when the store cannot be read.
    pub fn note(&self, id: &str) -> Result<Option<String>, AppError> {
        let store = self.store.lock()?;
        let message = store.get(id)?;
        Ok(store.note(message.thread_id.as_deref().unwrap_or(id))?)
    }

    /// Keeps a note on a message's conversation, private to this computer; an empty note is removed.
    ///
    /// # Errors
    ///
    /// [`AppError`] for an unknown id, or when the store cannot be written.
    pub fn set_note(&self, id: &str, text: &str) -> Result<(), AppError> {
        let store = self.store.lock()?;
        let message = store.get(id)?;
        store.set_note(message.thread_id.as_deref().unwrap_or(id), text, unix_now())?;
        Ok(())
    }

    /// What arrived since `since` (Unix seconds), per workspace: how many, how many unread, and the first subjects.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the store cannot be read.
    pub fn digest(&self, since: i64) -> Result<Vec<DigestLine>, AppError> {
        let names: std::collections::HashMap<String, String> = self.workspaces()?.into_iter().map(|workspace| (workspace.id, workspace.name)).collect();
        let messages = self.store.lock()?.view(buun_mail_store::View::All)?;
        let mut lines: Vec<DigestLine> = Vec::new();
        for message in messages.into_iter().filter(|message| message.sent_at >= since) {
            let workspace = names.get(&message.placement.workspace).cloned().unwrap_or_else(|| message.placement.workspace.clone());
            let index = lines.iter().position(|line| line.workspace == workspace).unwrap_or_else(|| {
                lines.push(DigestLine { workspace, count: 0, unread: 0, subjects: Vec::new() });
                lines.len() - 1
            });
            if let Some(line) = lines.get_mut(index) {
                line.count += 1;
                line.unread += usize::from(message.unread);
                if line.subjects.len() < DIGEST_SUBJECTS {
                    line.subjects.push(format!("{}: {}", message.from_name, message.subject));
                }
            }
        }
        lines.sort_by_key(|line| std::cmp::Reverse(line.count));
        Ok(lines)
    }

    /// One message's summary.
    ///
    /// # Errors
    ///
    /// [`AppError`] for an unknown id.
    pub fn message(&self, id: &str) -> Result<MessageDto, AppError> {
        Ok(self.store.lock()?.get(id)?.into())
    }

    /// True when someone answered the sent message `id`: a message in its conversation, not in Sent, dated after
    /// `since` (Unix seconds).
    ///
    /// # Errors
    ///
    /// [`AppError`] for an unknown id, or when the store cannot be read.
    pub fn answered_since(&self, id: &str, since: i64) -> Result<bool, AppError> {
        let store = self.store.lock()?;
        let sent = store.get(id)?;
        let Some(thread) = sent.thread_id else { return Ok(false) };
        Ok(store.thread(&thread)?.iter().any(|message| message.id != id && message.placement.folder.as_deref() != Some(SENT_FOLDER) && message.sent_at > since))
    }

    /// Notes a reminder that fell due with no answer, in the activity log.
    pub fn note_reminder(&self, subject: &str, to: &str) {
        if let Ok(store) = self.store.lock() {
            let _ = log(&store, &Actor::App, "reminder", format!("no reply yet from {to}: \"{subject}\""));
        }
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
        // Sizes and sender checks, for mail stored before they were kept.
        let bare = store.without_facts(batch)?;
        for id in &bare {
            let raw = store.raw(id).unwrap_or_default();
            let checks = buun_mail_message::authentication(&raw).map(|found| found.summary());
            store.set_facts(id, i64::try_from(raw.len()).unwrap_or(i64::MAX), checks.as_deref())?;
        }
        Ok(ids.len() + bare.len())
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
            .map(|(name, address, _, _)| ContactDto { name: (!name.is_empty() && name != address).then_some(name), address })
            .collect())
    }
}

/// How many subjects a digest names per workspace.
const DIGEST_SUBJECTS: usize = 5;

/// One workspace's part of a daily digest.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DigestLine {
    /// The workspace's name.
    pub workspace: String,
    /// Messages that arrived.
    pub count: usize,
    /// Of those, still unread.
    pub unread: usize,
    /// The first few, as `Sender: Subject`, newest first.
    pub subjects: Vec<String>,
}
