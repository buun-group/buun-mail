//! The ways the store can fail.

use thiserror::Error;

/// A store failure. Both kinds mean the disk or the database file is the problem, not the message.
#[derive(Debug, Error)]
pub enum StoreError {
    /// The SQLite index could not be read or written.
    #[error("the message index failed: {0}")]
    Index(#[from] rusqlite::Error),
    /// A raw message file could not be read or written.
    #[error("a message file failed: {0}")]
    File(#[from] std::io::Error),
    /// No message has this id.
    #[error("no message has the id {0}")]
    NotFound(String),
}
