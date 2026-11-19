//! Changing messages: tags, moves and read state. Every change is logged with who made it.

use buun_mail_store::Placement;

use super::{Actor, Mailbox, log};
use crate::dto::MessageDto;
use crate::error::AppError;

impl Mailbox {
    /// Marks messages read. Returns how many changed.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the store cannot be written.
    pub fn mark_read(&self, ids: &[String], actor: &Actor) -> Result<usize, AppError> {
        let store = self.store.lock()?;
        let mut changed = 0;
        for id in ids {
            if store.mark_read(id)? {
                changed += 1;
            }
        }
        if changed > 0 {
            log(&store, actor, "mark_read", format!("{changed} marked read"))?;
        }
        Ok(changed)
    }

    /// Marks a folder read, or the whole workspace when `whole_workspace` is set. Returns how many changed.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the store cannot be written.
    pub fn mark_all_read(&self, placement: &Placement, whole_workspace: bool, actor: &Actor) -> Result<usize, AppError> {
        let store = self.store.lock()?;
        let changed = store.mark_all_read(placement, whole_workspace)?;
        if changed > 0 {
            let place = if whole_workspace { placement.workspace.clone() } else { describe(placement) };
            log(&store, actor, "mark_read", format!("{changed} in {place} marked read"))?;
        }
        Ok(changed)
    }

    /// Adds tags to a message and returns it.
    ///
    /// # Errors
    ///
    /// [`AppError`] for an unknown id, or when the store cannot be written.
    pub fn tag(&self, id: &str, tags: &[String], actor: &Actor) -> Result<MessageDto, AppError> {
        let store = self.store.lock()?;
        store.add_tags(id, tags)?;
        let message = store.get(id)?;
        log(&store, actor, "tag", format!("{} on \"{}\"", tags.join(", "), message.subject))?;
        Ok(message.into())
    }

    /// Removes one tag from a message and returns it.
    ///
    /// # Errors
    ///
    /// [`AppError`] for an unknown id, or when the store cannot be written.
    pub fn untag(&self, id: &str, tag: &str, actor: &Actor) -> Result<MessageDto, AppError> {
        let store = self.store.lock()?;
        store.remove_tag(id, tag)?;
        let message = store.get(id)?;
        log(&store, actor, "untag", format!("{tag} from \"{}\"", message.subject))?;
        Ok(message.into())
    }

    /// Moves a message to another workspace or folder and returns it.
    ///
    /// # Errors
    ///
    /// [`AppError`] for an unknown id, or when the store cannot be written.
    pub fn move_message(&self, id: &str, placement: &Placement, actor: &Actor) -> Result<MessageDto, AppError> {
        let store = self.store.lock()?;
        store.move_to(id, placement)?;
        let message = store.get(id)?;
        log(&store, actor, "move", format!("\"{}\" to {}", message.subject, describe(placement)))?;
        Ok(message.into())
    }
}

/// A place in words: `acme` or `acme, Receipts`.
pub(super) fn describe(placement: &Placement) -> String {
    placement.folder.as_ref().map_or_else(|| placement.workspace.clone(), |folder| format!("{}, {folder}", placement.workspace))
}
