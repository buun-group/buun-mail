//! `.mbox` exports: many messages in one file, each starting with a `From ` line.

use std::io::Cursor;

use mail_parser::mailbox::mbox::MessageIterator;

/// Weekdays from 1 January 1970, a Thursday, for the `From ` line.
const DAYS: [&str; 7] = ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"];

/// Months for the `From ` line.
const MONTHS: [&str; 12] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

/// One message as an mbox entry: the `From ` line naming its sender and time (asctime, UTC), then its bytes with any
/// line that starts `From ` (after any `>`) given one more `>`, so readers never mistake it for the next message, then a blank line.
#[must_use]
pub fn mbox_entry(sender: &str, unix: i64, raw: &[u8]) -> Vec<u8> {
    let when = mail_parser::DateTime::from_timestamp(unix);
    let day = DAYS[usize::try_from(unix.div_euclid(86_400).rem_euclid(7)).unwrap_or(0)];
    let month = MONTHS[usize::from(when.month.clamp(1, 12)) - 1];
    let sender = if sender.trim().is_empty() { "MAILER-DAEMON" } else { sender.trim() };
    let mut entry = format!("From {sender} {day} {month} {:>2} {:02}:{:02}:{:02} {}\n", when.day, when.hour, when.minute, when.second, when.year).into_bytes();
    for line in raw.split_inclusive(|byte| *byte == b'\n') {
        // mboxrd: `From ` and `>From `, `>>From ` and so on each gain one more `>`.
        let unquoted = line.iter().position(|byte| *byte != b'>').map_or(&line[..0], |at| &line[at..]);
        if unquoted.starts_with(MBOX_SEPARATOR) {
            entry.push(b'>');
        }
        entry.extend_from_slice(line);
    }
    if !entry.ends_with(b"\n") {
        entry.push(b'\n');
    }
    entry.push(b'\n');
    entry
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
    fn writes_entries_that_read_back_with_from_lines_quoted() {
        let raw = b"From: a@b.com\nSubject: One\n\nFrom here on it is fine\n";
        let mut file = mbox_entry("a@b.com", 1_795_000_000, raw);
        file.extend(mbox_entry("c@d.com", 1_795_000_100, b"From: c@d.com\nSubject: Two\n\nsecond\n"));
        assert!(file.starts_with(b"From a@b.com "));
        assert!(String::from_utf8_lossy(&file).contains(">From here on"));
        let back = split_mbox(&file);
        assert_eq!(back.len(), 2);
        assert!(String::from_utf8_lossy(&back[1]).contains("Subject: Two"));
    }

    #[test]
    fn tells_one_message_from_an_mbox() {
        assert!(!is_mbox(b"From: a@b.com\r\n\r\nx"));
    }
}
