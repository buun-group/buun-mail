//! What the rest of the app hears about agent identities, so another service (`CryptFlare`) can keep a copy: an
//! identity made or given a new password (with the password), renamed or extended (without it), or ended. The
//! dissolve module never knows who listens; `lib.rs` connects the listener.

use std::sync::Arc;

use super::api::RemoteIdentity;
use super::service::DissolveService;

/// One agent identity as it is now. `password` is set only when it was just made or replaced.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IdentityRecord {
    /// dissolve.email's id for it.
    pub identity_id: String,
    /// The inbox it lives in, when known.
    pub inbox_id: Option<String>,
    /// The identity's address.
    pub email: String,
    /// The password, only with a made or replaced identity.
    pub password: Option<String>,
    /// The persona (name, birthday, phone, address), as JSON, when there is one.
    pub persona: Option<serde_json::Value>,
    /// The person's label for it.
    pub label: Option<String>,
    /// When it ends, RFC 3339.
    pub expires_at: Option<String>,
}

/// A change to an agent identity.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IdentityChange {
    /// Made, or given a new persona and password: the record carries the password.
    Saved(IdentityRecord),
    /// Renamed or extended: the record carries no password.
    Updated(IdentityRecord),
    /// Deleted, or its inbox ended or was burned.
    Ended {
        /// The identity's id, when known.
        identity_id: Option<String>,
        /// The identity's address.
        email: String,
    },
}

/// Hears every [`IdentityChange`]. Called on the thread that made the change, so it must not block.
pub type IdentitySink = Arc<dyn Fn(IdentityChange) + Send + Sync>;

/// A record from what dissolve.email answered, for the inbox `inbox` ending at `expires_at`.
pub(super) fn record_of(identity: &RemoteIdentity, inbox: Option<&str>, expires_at: Option<&str>) -> IdentityRecord {
    IdentityRecord {
        identity_id: identity.id.clone(),
        inbox_id: inbox.map(str::to_owned),
        email: identity.email.clone(),
        password: identity.password.clone().filter(|password| !password.is_empty()),
        persona: identity.persona.as_ref().and_then(|persona| serde_json::to_value(persona).ok()),
        label: None,
        expires_at: expires_at.map(str::to_owned),
    }
}

impl DissolveService {
    /// Sends every identity change to `sink` from now on, replacing any listener before it.
    pub fn on_identity(&self, sink: IdentitySink) {
        if let Ok(mut current) = self.0.identity_sink.lock() {
            *current = Some(sink);
        }
    }

    /// Tells the listener, if any.
    pub(super) fn identity_changed(&self, change: IdentityChange) {
        let sink = self.0.identity_sink.lock().ok().and_then(|current| current.clone());
        if let Some(sink) = sink {
            sink(change);
        }
    }

    /// Every live identity of the inboxes kept here, each read from dissolve.email with its password, for saving them
    /// all at once. An inbox whose identity cannot be read just now is left out.
    ///
    /// # Errors
    ///
    /// Why the settings could not be read.
    pub fn identity_records(&self) -> Result<Vec<IdentityRecord>, String> {
        let inboxes: Vec<(String, String)> = self
            .0
            .settings
            .lock()
            .map_err(|error| error.to_string())?
            .inboxes
            .iter()
            .filter(|(_, known)| !known.ended && known.identity.is_some())
            .map(|(id, known)| (id.clone(), known.expires_at.clone()))
            .collect();
        Ok(inboxes
            .into_iter()
            .filter_map(|(inbox, expires_at)| {
                let identity = self.call(|api| api.inbox_identity(&inbox)).ok().flatten()?;
                Some(record_of(&identity, Some(&inbox), Some(&expires_at)))
            })
            .collect())
    }
}
