//! The ways a message cannot be read.

use thiserror::Error;

/// Why a message could not be read. Each says what is missing, so an import report can name it.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum MessageError {
    /// The bytes are not an RFC 5322 message at all.
    #[error("this is not an email message")]
    NotAMessage,
    /// No sender address in `From:`.
    #[error("the message has no sender address")]
    NoSender,
    /// No recipient in the delivery headers or `To:`.
    #[error("the message has no recipient address")]
    NoRecipient,
}
