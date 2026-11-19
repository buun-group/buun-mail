//! `.mbox` exports: many messages in one file, each starting with a `From ` line.

use std::io::Cursor;

use mail_parser::mailbox::mbox::MessageIterator;

/// The line every message in an mbox file starts with.
const MBOX_SEPARATOR: &[u8] = b"From ";

/// True when the bytes look like an mbox file rather than one message.
#[must_use]
pub fn is_mbox(bytes: &[u8]) -> bool {
    bytes.starts_with(MBOX_SEPARATOR)
}

/// Every message in an mbox file, as raw bytes, in file order. Unreadable entries are skipped.
#[must_use]
pub fn split_mbox(bytes: &[u8]) -> Vec<Vec<u8>> {
    MessageIterator::new(Cursor::new(bytes)).filter_map(Result::ok).map(mail_parser::mailbox::mbox::Message::unwrap_contents).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const MBOX: &[u8] = b"From a@b.com Thu Nov 19 07:42:00 2026\nFrom: a@b.com\nTo: x@acme.com\nSubject: One\n\nfirst\n\nFrom c@d.com Thu Nov 19 08:00:00 2026\nFrom: c@d.com\nTo: y@acme.com\nSubject: Two\n\nsecond\n";

    #[test]
    fn splits_each_message() {
        assert!(is_mbox(MBOX));
        let messages = split_mbox(MBOX);
        assert_eq!(messages.len(), 2);
        assert!(String::from_utf8_lossy(&messages[1]).contains("Subject: Two"));
    }

    #[test]
    fn tells_one_message_from_an_mbox() {
        assert!(!is_mbox(b"From: a@b.com\r\n\r\nx"));
    }
}
