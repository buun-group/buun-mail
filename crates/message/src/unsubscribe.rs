//! How to leave a mailing list, from the message's own `List-Unsubscribe` header (RFC 2369): a web address, an email
//! address, or both, and whether the web address takes a one-click POST (`List-Unsubscribe-Post`, RFC 8058).

use crate::auth::{first_header, header_block};

/// The ways a message offers to unsubscribe.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Unsubscribe {
    /// An https address to visit or POST to.
    pub web: Option<String>,
    /// An address to email, with the subject or body the list asks for when the mailto names them.
    pub mail: Option<MailUnsubscribe>,
    /// True when the web address takes `List-Unsubscribe=One-Click` as a POST, so leaving needs no page at all.
    pub one_click: bool,
}

/// An unsubscribe by email.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MailUnsubscribe {
    /// The address.
    pub to: String,
    /// The subject the list asks for, or `unsubscribe`.
    pub subject: String,
    /// The body the list asks for, or empty.
    pub body: String,
}

/// Decodes `%XX` in a mailto part.
fn decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while let Some(&byte) = bytes.get(index) {
        let escaped =
            (byte == b'%').then(|| bytes.get(index + 1..index + 3)).flatten().and_then(|hex| u8::from_str_radix(std::str::from_utf8(hex).ok()?, 16).ok());
        if let Some(decoded) = escaped {
            out.push(decoded);
            index += 3;
        } else {
            out.push(byte);
            index += 1;
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn mail_from(link: &str) -> Option<MailUnsubscribe> {
    let rest = link.strip_prefix("mailto:").or_else(|| link.strip_prefix("MAILTO:"))?;
    let (to, query) = rest.split_once('?').unwrap_or((rest, ""));
    let to = decode(to).trim().to_owned();
    if !to.contains('@') {
        return None;
    }
    let field =
        |name: &str| query.split('&').find_map(|pair| pair.split_once('=').filter(|(key, _)| key.eq_ignore_ascii_case(name)).map(|(_, value)| decode(value)));
    Some(MailUnsubscribe {
        to,
        subject: field("subject").filter(|value| !value.trim().is_empty()).unwrap_or_else(|| "unsubscribe".to_owned()),
        body: field("body").unwrap_or_default(),
    })
}

/// How the message offers to unsubscribe, or `None` when it does not. Only https web addresses are offered.
#[must_use]
pub fn unsubscribe(raw: &[u8]) -> Option<Unsubscribe> {
    let headers = header_block(raw);
    let value = first_header(&headers, "list-unsubscribe")?;
    let links: Vec<&str> = value.split(',').filter_map(|part| part.trim().strip_prefix('<')?.strip_suffix('>')).map(str::trim).collect();
    let web = links.iter().find(|link| link.to_ascii_lowercase().starts_with("https://")).map(|link| (*link).to_owned());
    let mail = links.iter().find_map(|link| mail_from(link));
    if web.is_none() && mail.is_none() {
        return None;
    }
    let one_click = web.is_some()
        && first_header(&headers, "list-unsubscribe-post").is_some_and(|post| post.replace(' ', "").eq_ignore_ascii_case("List-Unsubscribe=One-Click"));
    Some(Unsubscribe { web, mail, one_click })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_web_mail_and_one_click() {
        let raw = b"List-Unsubscribe: <mailto:leave@list.example?subject=Remove%20me>,\r\n <https://list.example/u/abc>\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\r\nFrom: news@list.example\r\n\r\nhi";
        let found = unsubscribe(raw).unwrap_or(Unsubscribe { web: None, mail: None, one_click: false });
        assert_eq!(found.web.as_deref(), Some("https://list.example/u/abc"));
        assert!(found.one_click);
        assert_eq!(found.mail, Some(MailUnsubscribe { to: "leave@list.example".to_owned(), subject: "Remove me".to_owned(), body: String::new() }));
    }

    #[test]
    fn offers_only_https_and_nothing_without_the_header() {
        let plain = unsubscribe(b"List-Unsubscribe: <http://list.example/u>, <mailto:leave@list.example>\r\n\r\nx");
        assert_eq!(plain.as_ref().and_then(|found| found.web.clone()), None);
        assert_eq!(plain.and_then(|found| found.mail).map(|mail| mail.subject), Some("unsubscribe".to_owned()));
        assert_eq!(unsubscribe(b"From: a@b.example\r\n\r\nx"), None);
    }
}
