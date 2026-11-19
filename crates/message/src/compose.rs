//! Writing a message: the outgoing email as Buun Mail keeps it in Sent, with the headers that thread a reply.

use mail_builder::MessageBuilder;
use mail_builder::headers::address::Address;
use mail_parser::MessageParser;

use crate::parse::Contact;

/// A message to send. Addresses are plain; names are optional.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Outgoing {
    /// Who it is from.
    pub from: Contact,
    /// The To recipients.
    pub to: Vec<Contact>,
    /// The Cc recipients.
    pub cc: Vec<Contact>,
    /// The Bcc recipients: sent to, never shown to the others; kept in the Sent copy only.
    pub bcc: Vec<Contact>,
    /// Where replies should go, when not to the sender.
    pub reply_to: Vec<Contact>,
    /// The subject.
    pub subject: String,
    /// The text.
    pub text: String,
    /// The Message-ID of the message this answers, without angle brackets.
    pub in_reply_to: Option<String>,
    /// The thread so far: the answered message's References and its own id, oldest first.
    pub references: Vec<String>,
    /// This message's own Message-ID, without angle brackets.
    pub message_id: String,
    /// When it was written, Unix seconds.
    pub date: i64,
}

/// The ids a reply needs from the message it answers: that message's own id, and the references it carried.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ThreadIds {
    /// Its Message-ID, without angle brackets.
    pub message_id: Option<String>,
    /// Its References, oldest first, without angle brackets.
    pub references: Vec<String>,
}

/// Reads the ids a reply to `raw` should carry.
#[must_use]
pub fn thread_ids(raw: &[u8]) -> ThreadIds {
    let Some(message) = MessageParser::default().parse(raw) else { return ThreadIds::default() };
    let clean = |id: &str| id.trim().trim_matches(['<', '>']).to_owned();
    let references = message.references().map(|list| (0..list.len()).filter_map(|at| list.get(at)).map(clean).collect()).unwrap_or_default();
    ThreadIds { message_id: message.message_id().map(clean), references }
}

/// The References a reply carries: the answered message's own, then its id, without repeats.
#[must_use]
pub fn reply_references(answered: &ThreadIds) -> Vec<String> {
    let mut chain = answered.references.clone();
    if let Some(id) = &answered.message_id
        && !chain.contains(id)
    {
        chain.push(id.clone());
    }
    chain
}

/// A new Message-ID on the sender's own domain, from something unique to this message.
#[must_use]
pub fn new_message_id(from: &str, unique: &str) -> String {
    let domain = from.rsplit('@').next().filter(|domain| !domain.is_empty()).unwrap_or("buun-mail.local");
    format!("{unique}.buun-mail@{domain}")
}

/// The message's bytes, as the Sent folder keeps it.
#[must_use]
pub fn build(outgoing: &Outgoing) -> Vec<u8> {
    let mut message = MessageBuilder::new()
        .from(address(&outgoing.from))
        .subject(outgoing.subject.clone())
        .date(outgoing.date)
        .message_id(outgoing.message_id.clone())
        .text_body(outgoing.text.clone());
    for (list, set) in [(&outgoing.to, 0), (&outgoing.cc, 1), (&outgoing.bcc, 2), (&outgoing.reply_to, 3)] {
        if list.is_empty() {
            continue;
        }
        let people = Address::new_list(list.iter().map(address).collect());
        message = match set {
            0 => message.to(people),
            1 => message.cc(people),
            2 => message.bcc(people),
            _ => message.reply_to(people),
        };
    }
    if let Some(id) = &outgoing.in_reply_to {
        message = message.in_reply_to(id.clone());
    }
    if !outgoing.references.is_empty() {
        message = message.references(outgoing.references.clone());
    }
    message.write_to_vec().unwrap_or_default()
}

fn address(contact: &Contact) -> Address<'static> {
    Address::new_address(contact.name.clone(), contact.address.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse::{body_text, recipients};

    fn person(name: Option<&str>, address: &str) -> Contact {
        Contact { name: name.map(str::to_owned), address: address.to_owned() }
    }

    #[test]
    fn builds_a_reply_that_reads_back_with_its_thread() {
        let answered = thread_ids(b"From: a@b.com\r\nMessage-ID: <two@b.com>\r\nReferences: <one@b.com>\r\nSubject: Hi\r\n\r\nhello\r\n");
        assert_eq!(answered, ThreadIds { message_id: Some("two@b.com".to_owned()), references: vec!["one@b.com".to_owned()] });
        let outgoing = Outgoing {
            from: person(Some("Flung"), "buun-mail@flung.dev"),
            to: vec![person(None, "a@b.com")],
            cc: vec![person(Some("Ops"), "ops@b.com")],
            bcc: vec![person(None, "me@flung.dev")],
            reply_to: Vec::new(),
            subject: "Re: Hi".to_owned(),
            text: "Thanks!".to_owned(),
            in_reply_to: answered.message_id.clone(),
            references: reply_references(&answered),
            message_id: new_message_id("buun-mail@flung.dev", "abc123"),
            date: 1_795_000_000,
        };
        let raw = build(&outgoing);
        let text = String::from_utf8_lossy(&raw);
        assert!(text.contains("In-Reply-To: <two@b.com>"));
        assert!(text.contains("<one@b.com>") && text.contains("References:"));
        assert!(text.contains("Message-ID: <abc123.buun-mail@flung.dev>"));
        assert_eq!(body_text(&raw), "Thanks!");
        let back = recipients(&raw);
        assert_eq!(back.to.first().map(|contact| contact.address.as_str()), Some("a@b.com"));
        assert_eq!(back.cc.first().and_then(|contact| contact.name.as_deref()), Some("Ops"));
    }

    #[test]
    fn a_new_message_has_no_thread_headers() {
        let raw = build(&Outgoing {
            from: person(None, "hi@acme.com"),
            to: vec![person(None, "x@y.com")],
            cc: Vec::new(),
            bcc: Vec::new(),
            reply_to: Vec::new(),
            subject: "Hello".to_owned(),
            text: "Body".to_owned(),
            in_reply_to: None,
            references: Vec::new(),
            message_id: new_message_id("hi@acme.com", "x1"),
            date: 1_795_000_000,
        });
        let text = String::from_utf8_lossy(&raw);
        assert!(!text.contains("In-Reply-To") && !text.contains("References") && !text.contains("Cc:"));
    }
}
