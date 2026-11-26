//! Changing messages: tags, moves, read state, stars, archive and trash. Every change is logged with who made it.

use buun_mail_store::{Placement, Shelf, Store};

use super::{Actor, Changed, Mailbox, log, unix_now};
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
        let (message, alerts) = {
            let store = self.store.lock()?;
            let before = store.get(id)?.tags;
            store.add_tags(id, tags)?;
            let message = store.get(id)?;
            log(&store, actor, "tag", format!("{} on \"{}\"", tags.join(", "), message.subject))?;
            // A rule on a tag can alert when a person or an agent adds that tag.
            let fresh: Vec<&String> = tags.iter().filter(|tag| !before.iter().any(|had| had.eq_ignore_ascii_case(tag))).collect();
            let rules = self.rules.read()?;
            let mut alerts: Vec<String> = Vec::new();
            if let (false, Ok(from), Ok(to)) =
                (fresh.is_empty(), buun_mail_routing::Address::parse(&message.from), buun_mail_routing::Address::parse(&message.to))
            {
                let words = if rules.iter().any(buun_mail_rules::CheckedRule::needs_body) {
                    crate::ingest::rule_words(&store.raw(id).unwrap_or_default())
                } else {
                    String::new()
                };
                let facts = buun_mail_rules::Facts {
                    workspace: &message.placement.workspace,
                    folder: message.placement.folder.as_deref(),
                    from: &from,
                    to: &to,
                    subject: &message.subject,
                    body: &words,
                    tags: &message.tags,
                };
                for tag in fresh {
                    for channel in buun_mail_rules::alerts_for_tag(&rules, tag, &facts) {
                        if !alerts.contains(&channel) {
                            alerts.push(channel);
                        }
                    }
                }
            }
            (message, alerts)
        };
        self.alert(&alerts, &message);
        // Putting a tag on twice is harmless at a source, so every tag asked for is passed on.
        for tag in tags {
            self.changed(actor, Changed::Tagged { id: id.to_owned(), tag: tag.clone(), on: true });
        }
        Ok(message.into())
    }

    /// Removes one tag from a message and returns it.
    ///
    /// # Errors
    ///
    /// [`AppError`] for an unknown id, or when the store cannot be written.
    pub fn untag(&self, id: &str, tag: &str, actor: &Actor) -> Result<MessageDto, AppError> {
        let message = {
            let store = self.store.lock()?;
            store.remove_tag(id, tag)?;
            let message = store.get(id)?;
            log(&store, actor, "untag", format!("{tag} from \"{}\"", message.subject))?;
            message
        };
        self.changed(actor, Changed::Tagged { id: id.to_owned(), tag: tag.to_owned(), on: false });
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

/// How long a message stays in the trash before it is deleted for good: thirty days.
pub(super) const TRASH_DAYS: i64 = 30;

impl Mailbox {
    /// Marks messages read or unread and returns them as they are now.
    ///
    /// # Errors
    ///
    /// [`AppError`] for an unknown id, or when the store cannot be written.
    pub fn set_unread(&self, ids: &[String], unread: bool, actor: &Actor) -> Result<Vec<MessageDto>, AppError> {
        let store = self.store.lock()?;
        let changed = count(ids, |id| store.set_unread(id, unread))?;
        if changed > 0 {
            log(&store, actor, if unread { "mark_unread" } else { "mark_read" }, format!("{changed} marked {}", if unread { "unread" } else { "read" }))?;
        }
        fetch(&store, ids)
    }

    /// Stars or unstars messages and returns them as they are now.
    ///
    /// # Errors
    ///
    /// [`AppError`] for an unknown id, or when the store cannot be written.
    pub fn set_starred(&self, ids: &[String], starred: bool, actor: &Actor) -> Result<Vec<MessageDto>, AppError> {
        let store = self.store.lock()?;
        let changed = count(ids, |id| store.set_starred(id, starred))?;
        if changed > 0 {
            log(&store, actor, if starred { "star" } else { "unstar" }, format!("{changed} {}", if starred { "starred" } else { "unstarred" }))?;
        }
        fetch(&store, ids)
    }

    /// Archives, trashes or puts back messages. Returns how many changed.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the store cannot be written.
    pub fn shelve(&self, ids: &[String], to: Shelf, actor: &Actor) -> Result<usize, AppError> {
        let store = self.store.lock()?;
        let now = unix_now();
        let changed = count(ids, |id| store.set_shelf(id, to, now))?;
        if changed > 0 {
            let (action, words) = match to {
                Shelf::Active => ("restore", "put back"),
                Shelf::Archived => ("archive", "archived"),
                Shelf::Trashed => ("trash", "moved to the trash"),
            };
            log(&store, actor, action, format!("{changed} {words}"))?;
        }
        Ok(changed)
    }

    /// Snoozes messages until `until` (Unix seconds), or wakes them now with `None`. Returns how many changed.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the store cannot be written.
    pub fn snooze(&self, ids: &[String], until: Option<i64>, actor: &Actor) -> Result<usize, AppError> {
        let store = self.store.lock()?;
        let changed = count(ids, |id| store.set_snooze(id, until))?;
        if changed > 0 {
            let words = until.map_or_else(|| format!("{changed} woken"), |at| format!("{changed} snoozed until {}", buun_mail_message::rfc3339(at)));
            log(&store, actor, if until.is_some() { "snooze" } else { "wake" }, words)?;
        }
        Ok(changed)
    }

    /// Wakes every message whose snooze has ended, and returns them to announce as new.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the store cannot be written.
    pub fn wake_due(&self) -> Result<Vec<MessageDto>, AppError> {
        let store = self.store.lock()?;
        let woken = store.wake_due(unix_now())?;
        woken.iter().map(|id| Ok(store.get(id)?.into())).collect()
    }

    /// Deletes messages for good, bytes and all. Returns how many were deleted.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the store cannot be written.
    pub fn delete_forever(&self, ids: &[String], actor: &Actor) -> Result<usize, AppError> {
        let gone = {
            let store = self.store.lock()?;
            let mut gone = Vec::new();
            for id in ids {
                if store.delete(id)? {
                    gone.push(id.clone());
                }
            }
            if !gone.is_empty() {
                log(&store, actor, "delete", format!("{} deleted for good", gone.len()))?;
            }
            gone
        };
        let deleted = gone.len();
        if deleted > 0 {
            self.changed(actor, Changed::Deleted(gone));
        }
        Ok(deleted)
    }

    /// Empties the trash, or only what has been there longer than [`TRASH_DAYS`] when `only_expired`. Returns how many
    /// were deleted.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the store cannot be written.
    pub fn empty_trash(&self, only_expired: bool, actor: &Actor) -> Result<usize, AppError> {
        let ids = self.store.lock()?.trashed_before(only_expired.then(|| unix_now() - TRASH_DAYS * 24 * 60 * 60))?;
        self.delete_forever(&ids, actor)
    }
}

/// Runs `change` on each id and counts the ones it changed.
fn count(ids: &[String], mut change: impl FnMut(&str) -> Result<bool, buun_mail_store::StoreError>) -> Result<usize, AppError> {
    let mut changed = 0;
    for id in ids {
        if change(id)? {
            changed += 1;
        }
    }
    Ok(changed)
}

/// The messages with these ids, as they are now.
fn fetch(store: &Store, ids: &[String]) -> Result<Vec<MessageDto>, AppError> {
    ids.iter().map(|id| Ok(store.get(id)?.into())).collect()
}

/// A place in words: `acme` or `acme, Receipts`.
pub(super) fn describe(placement: &Placement) -> String {
    placement.folder.as_ref().map_or_else(|| placement.workspace.clone(), |folder| format!("{}, {folder}", placement.workspace))
}
