//! The one error the commands return. It reaches the UI as its message, which is written for a person.

use buun_mail_routing::ConfigError;
use buun_mail_rules::RuleError;
use buun_mail_store::StoreError;
use serde::{Serialize, Serializer};
use thiserror::Error;

/// Why a command failed.
#[derive(Debug, Error)]
pub enum AppError {
    /// The routing file is invalid.
    #[error("the routing file has a problem: {0}")]
    Routing(#[from] ConfigError),
    /// A rule is not valid.
    #[error(transparent)]
    Rule(#[from] RuleError),
    /// The local store failed.
    #[error(transparent)]
    Store(#[from] StoreError),
    /// A file could not be read or written.
    #[error("{path}: {source}")]
    File {
        /// The file.
        path: String,
        /// What went wrong.
        source: std::io::Error,
    },
    /// A lock was poisoned by a panic elsewhere; restarting the app clears it.
    #[error("the mailbox is unavailable after an earlier failure; restart Buun Mail")]
    Poisoned,
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

impl<T> From<std::sync::PoisonError<T>> for AppError {
    fn from(_: std::sync::PoisonError<T>) -> Self {
        Self::Poisoned
    }
}
