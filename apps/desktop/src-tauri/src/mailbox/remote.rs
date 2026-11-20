//! Taking in one message from a remote source that knows its envelope recipient, such as the mail gateway.

use super::{Actor, Mailbox, log};
use crate::dto::MessageDto;
use crate::error::AppError;
use buun_mail_store::Placement;

use crate::ingest::{Incoming, IngestError, ingest};

impl Mailbox {
    /// Parses, routes, runs rules on and stores one message delivered to `envelope_to`. Returns it when it was new and
    /// should be announced, `None` when it was already here or a rule keeps it quiet.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the mailbox is unavailable, or the message cannot be read or stored.
    pub fn take_in(&self, raw: &[u8], envelope_to: &str, received_at: i64) -> Result<Option<MessageDto>, AppError> {
        self.take_in_with(raw, Some(envelope_to), received_at)
    }

    /// As [`Mailbox::take_in`] for a source that does not know the envelope recipient, such as an IMAP mailbox: the
    /// recipient is read from the delivery headers.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the mailbox is unavailable, or the message cannot be read or stored.
    pub fn take_in_from_headers(&self, raw: &[u8], received_at: i64) -> Result<Option<MessageDto>, AppError> {
        self.take_in_with(raw, None, received_at)
    }

    fn take_in_with(&self, raw: &[u8], envelope_to: Option<&str>, received_at: i64) -> Result<Option<MessageDto>, AppError> {
        let router = self.router.read()?;
        let rules = self.rules.read()?;
        let store = self.store.lock()?;
        match ingest(Incoming { raw, envelope_to, received_at, placed: None }, &router, &rules, &store) {
            Ok(Some(new)) => {
                self.alert(&new.alerts, &new.record);
                Ok((!new.quiet).then(|| MessageDto::from(new.record)))
            }
            Ok(None) => Ok(None),
            Err(IngestError::Store(error)) => Err(AppError::Store(error)),
            Err(other) => Err(AppError::Unreadable(other.to_string())),
        }
    }

    /// Takes in one message from a source that decides its place itself, such as a dissolve.email inbox's folder.
    /// Returns the stored id, also when it was already here, and the message when it is new and should be announced.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the mailbox is unavailable, or the message cannot be read or stored.
    pub fn take_in_placed(&self, raw: &[u8], envelope_to: &str, placement: &Placement, received_at: i64) -> Result<(String, Option<MessageDto>), AppError> {
        let id = buun_mail_message::parse(raw, received_at).map_err(|error| AppError::Unreadable(error.to_string()))?.id;
        let router = self.router.read()?;
        let rules = self.rules.read()?;
        let store = self.store.lock()?;
        match ingest(Incoming { raw, envelope_to: Some(envelope_to), received_at, placed: Some(placement) }, &router, &rules, &store) {
            Ok(Some(new)) => {
                self.alert(&new.alerts, &new.record);
                Ok((id, (!new.quiet).then(|| MessageDto::from(new.record))))
            }
            Ok(None) => Ok((id, None)),
            Err(IngestError::Store(error)) => Err(AppError::Store(error)),
            Err(other) => Err(AppError::Unreadable(other.to_string())),
        }
    }

    /// Notes a message that could not be read, so it is not lost silently.
    pub fn note_unreadable(&self, source: &str, reason: &str) {
        if let Ok(store) = self.store.lock() {
            let _ = log(&store, &Actor::Rule("gateway".to_owned()), "unreadable", format!("{source}: {reason}"));
        }
    }
}
