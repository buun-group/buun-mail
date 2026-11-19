//! One raw message to the summary the list shows, and its text for the reader.

use mail_parser::{MessageParser, preview_text};

use crate::error::MessageError;
use crate::id::content_id;
use crate::recipient::recipient;

/// How many characters of body the list shows under the subject.
const PREVIEW_CHARS: usize = 180;

/// A message read for the list. Addresses are lower case. Nothing here is decided by routing.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Parsed {
    /// The SHA-256 of the raw bytes; see [`content_id`].
    pub id: String,
    /// The `Message-ID:` header, if any, for threading later.
    pub message_id: Option<String>,
    /// The sender's display name, or their address when there is none.
    pub from_name: String,
    /// The sender's address.
    pub from: String,
    /// The address it was delivered to; see the `recipient` module for the order headers are trusted.
    pub recipient: String,
    /// The subject, empty when there is none.
    pub subject: String,
    /// The first words of the body, on one line.
    pub preview: String,
    /// When it was sent, Unix seconds: the `Date:` header, else the fallback the caller passed.
    pub sent_at: i64,
}

/// Reads one message. `fallback_time` (Unix seconds) stands in for a missing or unreadable `Date:`; pass the time it
/// was received.
///
/// # Errors
///
/// [`MessageError`] when the bytes are not a message, or name no sender or recipient.
pub fn parse(raw: &[u8], fallback_time: i64) -> Result<Parsed, MessageError> {
    let message = MessageParser::default().parse(raw).ok_or(MessageError::NotAMessage)?;
    let sender = message.from().and_then(|from| from.first());
    let from = sender.and_then(|mailbox| mailbox.address()).map(str::to_lowercase).ok_or(MessageError::NoSender)?;
    let from_name = sender.and_then(|mailbox| mailbox.name()).map_or_else(|| from.clone(), str::to_owned);
    let recipient = recipient(&message).ok_or(MessageError::NoRecipient)?;
    let preview = message.body_preview(PREVIEW_CHARS * 2).map(|text| preview_text(&one_line(&text), PREVIEW_CHARS).into_owned()).unwrap_or_default();

    Ok(Parsed {
        id: content_id(raw),
        message_id: message.message_id().map(str::to_owned),
        from_name,
        from,
        recipient,
        subject: message.subject().unwrap_or_default().trim().to_owned(),
        preview,
        sent_at: message.date().map_or(fallback_time, |date| date.to_timestamp()),
    })
}

/// The message's readable text: the plain part, or the HTML part turned into text. Empty when it has neither.
#[must_use]
pub fn body_text(raw: &[u8]) -> String {
    MessageParser::default().parse(raw).and_then(|message| message.body_text(0).map(|text| text.trim().to_owned())).unwrap_or_default()
}

/// One person on a message: their display name when it has one, and their address.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Contact {
    /// The display name, `None` when the header gives only an address.
    pub name: Option<String>,
    /// The address, lowercased.
    pub address: String,
}

/// Who a message was written to, as its headers say: To, Cc and Reply-To. Each is empty when the header is missing.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Recipients {
    /// The To header.
    pub to: Vec<Contact>,
    /// The Cc header.
    pub cc: Vec<Contact>,
    /// The Reply-To header.
    pub reply_to: Vec<Contact>,
}

/// The To, Cc and Reply-To headers of a message, groups opened up. Empty lists when it cannot be read.
#[must_use]
pub fn recipients(raw: &[u8]) -> Recipients {
    let Some(message) = MessageParser::default().parse(raw) else { return Recipients::default() };
    let contacts = |header: Option<mail_parser::AddressList<'_>>| -> Vec<Contact> {
        header
            .map(|list| {
                list.mailboxes()
                    .filter_map(|person| {
                        let address = person.address()?.trim().to_lowercase();
                        let name = person.name().map(one_line).filter(|name| !name.is_empty() && name.to_lowercase() != address);
                        Some(Contact { name, address })
                    })
                    .collect()
            })
            .unwrap_or_default()
    };
    Recipients { to: contacts(message.to()), cc: contacts(message.cc()), reply_to: contacts(message.reply_to()) }
}

/// Collapses every run of whitespace, line breaks included, into one space.
fn one_line(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_to_cc_and_reply_to_with_names() {
        let raw =
            b"From: a@b.com\r\nTo: \"Team\" <Team@Acme.com>, solo@acme.com\r\nCc: Ops <ops@acme.com>\r\nReply-To: help@acme.com\r\nSubject: x\r\n\r\nbody\r\n";
        let found = recipients(raw);
        assert_eq!(
            found.to,
            vec![Contact { name: Some("Team".to_owned()), address: "team@acme.com".to_owned() }, Contact { name: None, address: "solo@acme.com".to_owned() }]
        );
        assert_eq!(found.cc, vec![Contact { name: Some("Ops".to_owned()), address: "ops@acme.com".to_owned() }]);
        assert_eq!(found.reply_to.first().map(|contact| contact.address.as_str()), Some("help@acme.com"));
    }

    #[test]
    fn has_empty_lists_when_headers_are_missing() {
        assert_eq!(recipients(b"From: a@b.com\r\nSubject: x\r\n\r\nbody"), Recipients::default());
    }

    const PLAIN: &[u8] = b"From: \"Stripe\" <Invoices@Stripe.com>\r\nDelivered-To: billing@acme.com\r\nTo: team@acme.com\r\nSubject: Your invoice\r\nDate: Thu, 19 Nov 2026 07:42:00 +0000\r\nMessage-ID: <abc@stripe.com>\r\n\r\nInvoice INV-11\r\nis ready.\r\n";

    #[test]
    fn reads_the_summary() -> Result<(), MessageError> {
        let parsed = parse(PLAIN, 0)?;
        assert_eq!(parsed.from, "invoices@stripe.com");
        assert_eq!(parsed.from_name, "Stripe");
        assert_eq!(parsed.recipient, "billing@acme.com");
        assert_eq!(parsed.subject, "Your invoice");
        assert_eq!(parsed.preview, "Invoice INV-11 is ready.");
        assert_eq!(parsed.message_id.as_deref(), Some("abc@stripe.com"));
        assert_eq!(parsed.sent_at, 1_795_074_120);
        Ok(())
    }

    #[test]
    fn uses_the_fallback_time_without_a_date() -> Result<(), MessageError> {
        assert_eq!(parse(b"From: a@b.com\r\nTo: x@y.com\r\n\r\nhi", 42)?.sent_at, 42);
        Ok(())
    }

    #[test]
    fn names_the_sender_by_address_when_there_is_no_name() -> Result<(), MessageError> {
        assert_eq!(parse(b"From: a@b.com\r\nTo: x@y.com\r\n\r\nhi", 0)?.from_name, "a@b.com");
        Ok(())
    }

    #[test]
    fn refuses_mail_without_a_sender_or_recipient() {
        assert_eq!(parse(b"To: x@y.com\r\n\r\nhi", 0), Err(MessageError::NoSender));
        assert_eq!(parse(b"From: a@b.com\r\n\r\nhi", 0), Err(MessageError::NoRecipient));
    }

    #[test]
    fn reads_html_only_mail_as_text() {
        let raw = b"From: a@b.com\r\nTo: x@y.com\r\nContent-Type: text/html\r\n\r\n<p>Hello <b>there</b></p>";
        assert_eq!(body_text(raw), "Hello there");
    }
}
