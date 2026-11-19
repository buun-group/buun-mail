//! Who a message was delivered to, for messages that arrive without their envelope (an import, an IMAP pull).
//!
//! Mail from the Cloudflare Worker carries the envelope recipient and never needs this. A file does not, so the
//! address is read from the headers a server adds on delivery, most trustworthy first, and `To:` only as a last resort.

use mail_parser::Message;

/// Delivery headers, in the order they are trusted. Each names the address the message was delivered to.
const DELIVERY_HEADERS: [&str; 3] = ["Delivered-To", "X-Original-To", "Envelope-To"];

/// The address a message was delivered to, lower case, or `None` when no header names one.
pub(crate) fn recipient(message: &Message<'_>) -> Option<String> {
    let headers = message.headers();
    DELIVERY_HEADERS
        .iter()
        .find_map(|name| headers.get(*name).and_then(|header| header.value().as_text()).map(clean))
        .filter(|address| address.contains('@'))
        .or_else(|| message.to().and_then(|to| to.first()).and_then(|mailbox| mailbox.address()).map(clean))
}

/// Trims space and angle brackets, and folds case: `<Sales@Acme.com>` becomes `sales@acme.com`.
fn clean(address: &str) -> String {
    address.trim().trim_start_matches('<').trim_end_matches('>').trim().to_lowercase()
}

#[cfg(test)]
mod tests {
    use mail_parser::MessageParser;

    use super::*;

    fn recipient_of(raw: &str) -> Option<String> {
        MessageParser::default().parse(raw.as_bytes()).and_then(|message| recipient(&message))
    }

    #[test]
    fn trusts_delivered_to_over_to() {
        let raw = "Delivered-To: billing@acme.com\r\nTo: Team <team@lists.example>\r\nFrom: a@b.com\r\n\r\nx";
        assert_eq!(recipient_of(raw).as_deref(), Some("billing@acme.com"));
    }

    #[test]
    fn falls_back_to_x_original_to_then_to() {
        assert_eq!(recipient_of("X-Original-To: <Sales@Acme.com>\r\nTo: x@y.com\r\n\r\nx").as_deref(), Some("sales@acme.com"));
        assert_eq!(recipient_of("To: Ada <ADA@example.com>\r\n\r\nx").as_deref(), Some("ada@example.com"));
    }

    #[test]
    fn is_none_without_any_address() {
        assert_eq!(recipient_of("Subject: hi\r\n\r\nx"), None);
    }
}
