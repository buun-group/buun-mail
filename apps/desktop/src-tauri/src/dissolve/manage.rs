//! What the app does with a dissolve.email account beyond collecting mail: keeping deletions in step both ways, putting
//! a tag added here on as the label of the same name there, an inbox's aliases, and the account's agent identities.

use std::sync::mpsc;

use serde::Serialize;

use super::api::{Api, Removal};
use super::manage_api::{Alias, ListedIdentity};
use super::service::DissolveService;
use super::settings::DissolveSettings;
use crate::mailbox::{Actor, Changed};

/// What Extend adds to an identity when the plan has not said how long an inbox lives, in minutes.
const DEFAULT_EXTEND_MINUTES: i64 = 60;

/// An agent identity in the account's list, as the window sees it: never the password.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct IdentityRowDto {
    /// Its id.
    pub id: String,
    /// Its address.
    pub email: String,
    /// The label the person gave it.
    pub label: Option<String>,
    /// When it ends, RFC 3339.
    pub expires_at: Option<String>,
    /// The inbox it lives in, when that inbox is one of this account's folders here.
    pub inbox: Option<String>,
}

impl From<ListedIdentity> for IdentityRowDto {
    fn from(identity: ListedIdentity) -> Self {
        Self { id: identity.id, email: identity.email, label: identity.label, expires_at: identity.expires_at, inbox: identity.inbox_id }
    }
}

/// An inbox's id and a message's id there, for each message here that came from dissolve.email.
fn remote_of(saved: &DissolveSettings, stored: &str) -> Option<(String, String)> {
    saved
        .inboxes
        .iter()
        .find_map(|(inbox, known)| known.messages.iter().find(|(_, here)| here.as_str() == stored).map(|(remote, _)| (inbox.clone(), remote.clone())))
}

impl DissolveService {
    /// Deletes here the messages the changes feed says were deleted on dissolve.email. Whole inboxes that ended are left
    /// to the inbox list, which also honours keeping their mail.
    pub(super) fn apply_removals(&self, removed: &[Removal], saved: &mut DissolveSettings) -> Result<(), crate::error::AppError> {
        let mut gone = Vec::new();
        for removal in removed {
            let Some(message) = &removal.message_id else { continue };
            if let Some(stored) = saved.inboxes.get_mut(&removal.inbox_id).and_then(|known| known.messages.remove(message)) {
                gone.push(stored);
            }
        }
        if !gone.is_empty() {
            // As the app, so the deletion is not sent back to dissolve.email.
            self.0.mailbox.delete_forever(&gone, &Actor::App)?;
        }
        Ok(())
    }

    /// Listens for deletions and tags made here by a person, a rule or an agent, and mirrors them to dissolve.email.
    pub fn watch_changes(&self) {
        let (sink, changes) = mpsc::channel();
        self.0.mailbox.on_change(sink);
        let service = self.clone();
        std::thread::spawn(move || {
            for change in changes {
                match change {
                    Changed::Deleted(ids) => service.forget_deleted(&ids),
                    Changed::Tagged { id, tag, on } => service.mirror_tag(&id, &tag, on),
                }
            }
        });
    }

    /// Deletes on dissolve.email the messages deleted for good here. The link is dropped first, so a message the server
    /// refuses to delete (an inbox a team shares, not owned) is not taken in again here.
    pub fn forget_deleted(&self, ids: &[String]) {
        let Ok(mut saved) = self.0.settings.lock().map(|saved| saved.clone()) else { return };
        if saved.account.is_none() {
            return;
        }
        let mut remote: Vec<(String, String)> = Vec::new();
        for (inbox, known) in &mut saved.inboxes {
            known.messages.retain(|message, stored| {
                let deleted = ids.contains(stored);
                if deleted {
                    remote.push((inbox.clone(), message.clone()));
                }
                !deleted
            });
        }
        if remote.is_empty() || self.save(&saved).is_err() {
            return;
        }
        for (inbox, message) in remote {
            if let Err(error) = self.call(|api| api.delete_message(&inbox, &message)) {
                self.0.mailbox.note_unreadable(&format!("dissolve.email {message}"), &format!("not deleted there: {error}"));
            }
        }
    }

    /// Puts the dissolve.email label named like `tag` (any case) on the message, or takes it off. Nothing happens for a
    /// message from elsewhere, a tag with no label of its name, or a plan without labels.
    pub fn mirror_tag(&self, stored: &str, tag: &str, on: bool) {
        let Some((_, message)) = self.0.settings.lock().ok().and_then(|saved| remote_of(&saved, stored)) else { return };
        let Ok(labels) = self.call(Api::labels) else { return };
        if let Some(label) = labels.iter().find(|label| label.name.eq_ignore_ascii_case(tag.trim())) {
            let _ = self.call(|api| api.set_label(&message, &label.id, on));
        }
    }

    /// An inbox's aliases.
    ///
    /// # Errors
    ///
    /// Why they could not be read, in words.
    pub fn aliases(&self, inbox: &str) -> Result<Vec<Alias>, String> {
        self.call(|api| api.aliases(inbox)).map_err(|error| error.to_string())
    }

    /// Adds an alias to an inbox and returns its aliases. Mail to it lands in the inbox's folder.
    ///
    /// # Errors
    ///
    /// dissolve.email's refusal in its words, such as the plan's cap.
    pub fn add_alias(&self, inbox: &str, local: &str) -> Result<Vec<Alias>, String> {
        let local = local.trim();
        if local.is_empty() {
            return Err("Write the part before the @.".to_owned());
        }
        self.call(|api| api.create_alias(inbox, local)).map_err(|error| error.to_string())?;
        self.aliases(inbox)
    }

    /// Removes an alias from an inbox and returns its aliases.
    ///
    /// # Errors
    ///
    /// Why it could not be removed, in words.
    pub fn remove_alias(&self, inbox: &str, alias: &str) -> Result<Vec<Alias>, String> {
        self.call(|api| api.delete_alias(inbox, alias)).map_err(|error| error.to_string())?;
        self.aliases(inbox)
    }

    /// The account's agent identities, marked with the inboxes kept here.
    ///
    /// # Errors
    ///
    /// Why they could not be read, such as a plan or sign-in without identities.
    pub fn identities(&self) -> Result<Vec<IdentityRowDto>, String> {
        let listed = self.call(Api::identities).map_err(|error| error.to_string())?;
        let known: Vec<String> = self.0.settings.lock().map(|saved| saved.inboxes.keys().cloned().collect()).unwrap_or_default();
        Ok(listed
            .into_iter()
            .map(IdentityRowDto::from)
            .map(|mut row| {
                row.inbox = row.inbox.filter(|inbox| known.contains(inbox));
                row
            })
            .collect())
    }

    /// Extends an identity, relabels it, or both; returns the list. dissolve.email sets an identity's expiry to now plus
    /// the minutes it is sent, even for a rename, so the minutes are always worked out here from its current expiry: a
    /// rename keeps it, and Extend adds the plan's inbox time to what is left (60 minutes when the plan has not said).
    ///
    /// # Errors
    ///
    /// dissolve.email's refusal in its words, such as past the plan's longest life.
    pub fn update_identity(&self, id: &str, extend: bool, label: Option<&str>) -> Result<Vec<IdentityRowDto>, String> {
        if !extend && label.is_none() {
            return self.identities();
        }
        let listed = self.call(Api::identities).map_err(|error| error.to_string())?;
        let expires = listed.iter().find(|identity| identity.id == id).and_then(|identity| identity.expires_at.as_deref()).and_then(buun_mail_message::unix_of);
        let left = expires.map_or(0, |at| ((at - crate::mailbox::unix_now()).max(0) + 59) / 60);
        let minutes = if extend { left + self.plan_inbox_minutes().unwrap_or(DEFAULT_EXTEND_MINUTES) } else { left.max(1) };
        self.call(|api| api.update_identity(id, Some(minutes), label)).map_err(|error| error.to_string())?;
        self.identities()
    }

    /// Deletes an identity, keeping its inbox and mail; returns the list.
    ///
    /// # Errors
    ///
    /// Why it could not be deleted, in words.
    pub fn delete_identity(&self, id: &str) -> Result<Vec<IdentityRowDto>, String> {
        self.call(|api| api.delete_identity(id)).map_err(|error| error.to_string())?;
        let inboxes: Vec<String> = self
            .0
            .settings
            .lock()
            .map(|saved| saved.inboxes.iter().filter(|(_, known)| known.identity.as_deref() == Some(id)).map(|(inbox, _)| inbox.clone()).collect())
            .unwrap_or_default();
        for inbox in inboxes {
            self.note_identity(&inbox, None)?;
        }
        self.identities()
    }
}
