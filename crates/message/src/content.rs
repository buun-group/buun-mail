//! What a message holds beyond its text: its HTML, ready to show with inline images embedded, and its attachments.

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;
use mail_parser::{MessageParser, PartKind};

/// A message's HTML, with images it carries (`cid:` links) embedded as `data:` addresses, and how many pictures or
/// styles it would fetch from the internet if allowed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HtmlView {
    /// The HTML, inline images embedded.
    pub html: String,
    /// How many remote images or styles it asks for (`src`, `srcset`, `background` and CSS `url()` over http).
    pub remote: usize,
}

/// One attachment: where it sits, what it is called and holds, and whether it is a picture shown inside the HTML.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AttachmentInfo {
    /// Its position among the message's attachments, for [`attachment`].
    pub index: usize,
    /// Its file name, or a plain name made from its type when it has none.
    pub name: String,
    /// Its media type, such as `application/pdf`.
    pub mime: String,
    /// Its size once decoded, in bytes.
    pub size: usize,
    /// True for a picture the HTML shows inline through a `cid:` link.
    pub inline: bool,
}

/// The message's HTML view, or `None` when it has no HTML part (it is plain text) or cannot be read.
#[must_use]
pub fn html_view(raw: &[u8]) -> Option<HtmlView> {
    let message = MessageParser::default().parse(raw)?;
    if !message.html_body().any(|part| matches!(part.kind(), PartKind::Html)) {
        return None;
    }
    let mut html = message.body_html(0)?.into_owned();
    for part in message.attachments() {
        let (Some(id), Some(kind)) = (part.content_id(), part.content_type()) else { continue };
        if kind.ctype() != "image" {
            continue;
        }
        let mime = format!("image/{}", kind.subtype().unwrap_or("png"));
        let data = format!("data:{mime};base64,{}", STANDARD.encode(part.decoded()));
        let id = id.trim_matches(['<', '>']);
        html = replace_ignoring_case(&html, &format!("cid:{id}"), &data);
    }
    let remote = count_remote(&html);
    Some(HtmlView { html, remote })
}

/// Every attachment, in order, with inline pictures marked.
#[must_use]
pub fn attachments(raw: &[u8]) -> Vec<AttachmentInfo> {
    let Some(message) = MessageParser::default().parse(raw) else { return Vec::new() };
    let html = message.body_html(0).map(|html| html.to_lowercase()).unwrap_or_default();
    message
        .attachments()
        .enumerate()
        .map(|(index, part)| {
            let mime = part
                .content_type()
                .map_or_else(|| "application/octet-stream".to_owned(), |kind| format!("{}/{}", kind.ctype(), kind.subtype().unwrap_or("octet-stream")));
            let inline = part.content_id().is_some_and(|id| html.contains(&format!("cid:{}", id.trim_matches(['<', '>']).to_lowercase())));
            let name = part
                .attachment_name()
                .map(file_name)
                .filter(|name| !name.is_empty())
                .unwrap_or_else(|| format!("attachment-{}.{}", index + 1, extension_for(&mime)));
            AttachmentInfo { index, name, mime, size: part.decoded_len(), inline }
        })
        .collect()
}

/// One attachment's name, type and decoded bytes, or `None` for an index past the last.
#[must_use]
pub fn attachment(raw: &[u8], index: usize) -> Option<(AttachmentInfo, Vec<u8>)> {
    let info = attachments(raw).into_iter().nth(index)?;
    let message = MessageParser::default().parse(raw)?;
    let bytes = message.attachments().nth(index)?.decoded().into_owned();
    Some((info, bytes))
}

/// A file name with any folders and characters a file system refuses removed, so saving never writes elsewhere.
fn file_name(name: &str) -> String {
    let last = name.rsplit(['/', '\\']).next().unwrap_or(name);
    last.chars()
        .filter(|c| !c.is_control() && !matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*'))
        .collect::<String>()
        .trim()
        .trim_start_matches('.')
        .to_owned()
}

/// A file extension for an attachment without a name.
fn extension_for(mime: &str) -> &str {
    match mime {
        "application/pdf" => "pdf",
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/gif" => "gif",
        "text/calendar" => "ics",
        "text/csv" => "csv",
        "message/rfc822" => "eml",
        _ => "bin",
    }
}

/// `text` with every `from` replaced by `to`, matching `from` without regard to ASCII case.
fn replace_ignoring_case(text: &str, from: &str, to: &str) -> String {
    let lower = text.to_ascii_lowercase();
    let needle = from.to_ascii_lowercase();
    let mut out = String::with_capacity(text.len());
    let mut at = 0;
    while let Some(found) = lower[at..].find(&needle) {
        out.push_str(&text[at..at + found]);
        out.push_str(to);
        at += found + needle.len();
    }
    out.push_str(&text[at..]);
    out
}

/// How many remote resources the HTML asks for.
fn count_remote(html: &str) -> usize {
    let lower = html.to_ascii_lowercase();
    ["src=\"http", "src='http", "src=http", "srcset=\"http", "background=\"http", "url(http", "url('http", "url(\"http"]
        .iter()
        .map(|pattern| lower.matches(pattern).count())
        .sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    const MIXED: &[u8] = b"From: a@b.com\r\nTo: x@acme.com\r\nSubject: Hi\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=\"outer\"\r\n\r\n--outer\r\nContent-Type: multipart/related; boundary=\"rel\"\r\n\r\n--rel\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>Hello <img src=\"cid:logo@x\"> <img src=\"https://track.example/p.gif\"></p>\r\n--rel\r\nContent-Type: image/png\r\nContent-ID: <logo@x>\r\nContent-Transfer-Encoding: base64\r\n\r\niVBORw0KGgo=\r\n--rel--\r\n--outer\r\nContent-Type: application/pdf; name=\"../../invoice.pdf\"\r\nContent-Disposition: attachment; filename=\"../../invoice.pdf\"\r\nContent-Transfer-Encoding: base64\r\n\r\nJVBERi0xLjQ=\r\n--outer--\r\n";

    #[test]
    fn embeds_inline_images_and_counts_remote_ones() {
        let view = html_view(MIXED).unwrap_or(HtmlView { html: String::new(), remote: 0 });
        assert!(view.html.contains("data:image/png;base64,iVBORw0KGgo="));
        assert!(!view.html.contains("cid:"));
        assert_eq!(view.remote, 1);
    }

    #[test]
    fn lists_attachments_with_safe_names_and_reads_their_bytes() {
        let found = attachments(MIXED);
        assert_eq!(found.len(), 2);
        assert!(found[0].inline);
        assert_eq!(found[1].name, "invoice.pdf");
        assert_eq!(found[1].mime, "application/pdf");
        assert!(!found[1].inline);
        let (_, bytes) = attachment(MIXED, 1).unwrap_or((found[1].clone(), Vec::new()));
        assert!(bytes.starts_with(b"%PDF"));
        assert!(attachment(MIXED, 9).is_none());
    }

    #[test]
    fn plain_text_mail_has_no_html_view() {
        assert!(html_view(b"From: a@b.com\r\nSubject: x\r\n\r\njust text\r\n").is_none());
    }
}
