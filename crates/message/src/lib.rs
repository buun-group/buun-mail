//! Reads raw mail into the parts Buun Mail shows. Pure: bytes in, values out, no files, no clock.
//!
//! - [`parse`] turns one RFC 5322 message into a [`Parsed`] summary.
//! - [`body_text`] gives a message's readable text, for the reader.
//! - [`split_mbox`] cuts an `.mbox` export into its messages.
//! - [`content_id`] names a message by its bytes, so importing it twice stores it once.
//!
//! ```
//! let raw = b"From: Ada <ada@example.com>\r\nTo: sales@acme.com\r\nSubject: Hello\r\n\r\nHi there.\r\n";
//! let parsed = buun_mail_message::parse(raw, 0)?;
//! assert_eq!(parsed.from, "ada@example.com");
//! assert_eq!(parsed.recipient, "sales@acme.com");
//! # Ok::<(), buun_mail_message::MessageError>(())
//! ```

mod error;
mod id;
mod mbox;
mod parse;
mod recipient;
mod time;

pub use error::MessageError;
pub use id::content_id;
pub use mbox::{is_mbox, mbox_entry, split_mbox};
pub use parse::{Parsed, body_text, parse};
pub use time::rfc3339;
