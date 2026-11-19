//! Writing messages out: the original `.eml`, several as `.mbox`, or a summary with the readable text as JSON, CSV or
//! plain text; and saving one attachment.

use std::fs;
use std::path::Path;

use buun_mail_message::{body_text, mbox_entry, rfc3339};
use buun_mail_store::MessageRecord;
use serde::{Deserialize, Serialize};

use super::Mailbox;
use crate::error::AppError;

/// The shapes an export can take.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ExportFormat {
    /// One message's original bytes.
    Eml,
    /// Messages' original bytes, one after another.
    Mbox,
    /// A JSON array of summaries with their text.
    Json,
    /// A spreadsheet row per message.
    Csv,
    /// Readable text, one message after another.
    Text,
}

/// One exported message, as JSON names it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Exported<'a> {
    id: &'a str,
    workspace: &'a str,
    folder: Option<&'a str>,
    from_name: &'a str,
    from: &'a str,
    to: &'a str,
    subject: &'a str,
    received_at: String,
    unread: bool,
    starred: bool,
    tags: &'a [String],
    body: &'a str,
}

/// The CSV columns, in order.
const CSV_COLUMNS: [&str; 9] = ["received_at", "from_name", "from", "to", "subject", "workspace", "folder", "tags", "body"];

/// How large an attachment may be to show inside the app; larger ones are opened or saved instead.
const PREVIEW_LIMIT: usize = 15 * 1024 * 1024;

/// File extensions the system may open with its own app: documents, pictures and archives. Programs and scripts are
/// never among them, so opening an attachment can never run something a message carried.
const OPENABLE: [&str; 22] = [
    "pdf", "png", "jpg", "jpeg", "gif", "webp", "heic", "txt", "md", "csv", "json", "ics", "rtf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods",
    "zip",
];

/// True when an attachment's name ends in an extension the system may open.
#[must_use]
pub fn openable(name: &str) -> bool {
    name.rsplit_once('.').is_some_and(|(_, extension)| OPENABLE.contains(&extension.to_ascii_lowercase().as_str()))
}

/// One attachment's bytes for a preview inside the app, as base64, with its type.
#[derive(Debug, Clone, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentDataDto {
    /// Its name.
    pub name: String,
    /// Its media type.
    pub mime: String,
    /// Its bytes, base64.
    pub base64: String,
}

impl Mailbox {
    /// One attachment's bytes for a preview, when it is small enough to show.
    ///
    /// # Errors
    ///
    /// [`AppError`] for an unknown message or attachment, or one too large to preview.
    pub fn attachment_data(&self, id: &str, index: usize) -> Result<AttachmentDataDto, AppError> {
        use base64::Engine as _;
        let raw = self.store.lock()?.raw(id)?;
        let (info, bytes) =
            buun_mail_message::attachment(&raw, index).ok_or_else(|| AppError::Unreadable("That attachment is not in the message.".to_owned()))?;
        if bytes.len() > PREVIEW_LIMIT {
            return Err(AppError::Unreadable("That attachment is too large to show here; open or save it instead.".to_owned()));
        }
        Ok(AttachmentDataDto { name: info.name, mime: info.mime, base64: base64::engine::general_purpose::STANDARD.encode(bytes) })
    }

    /// Writes one attachment to a private folder for this app in the system's temporary folder, and returns its path,
    /// for the system to open. Refuses a program or script.
    ///
    /// # Errors
    ///
    /// [`AppError`] for an unknown message or attachment, a kind of file that may not be opened, or a write failure.
    pub fn attachment_to_open(&self, id: &str, index: usize) -> Result<std::path::PathBuf, AppError> {
        let raw = self.store.lock()?.raw(id)?;
        let (info, bytes) =
            buun_mail_message::attachment(&raw, index).ok_or_else(|| AppError::Unreadable("That attachment is not in the message.".to_owned()))?;
        if !openable(&info.name) {
            return Err(AppError::Unreadable(format!("{} is a kind of file Buun Mail will not open; save it and check it first.", info.name)));
        }
        let folder = std::env::temp_dir().join("buun-mail-attachments").join(id.get(..16).unwrap_or(id));
        fs::create_dir_all(&folder).map_err(|source| AppError::File { path: folder.display().to_string(), source })?;
        let path = folder.join(&info.name);
        fs::write(&path, bytes).map_err(|source| AppError::File { path: path.display().to_string(), source })?;
        Ok(path)
    }

    /// Saves one attachment of a message to `path`. Returns its file name.
    ///
    /// # Errors
    ///
    /// [`AppError`] for an unknown message or attachment, or when the file cannot be written.
    pub fn save_attachment(&self, id: &str, index: usize, path: &Path) -> Result<String, AppError> {
        let raw = self.store.lock()?.raw(id)?;
        let (info, bytes) =
            buun_mail_message::attachment(&raw, index).ok_or_else(|| AppError::Unreadable("That attachment is not in the message.".to_owned()))?;
        fs::write(path, bytes).map_err(|source| AppError::File { path: path.display().to_string(), source })?;
        Ok(info.name)
    }

    /// Writes messages to `path` in `format`. Returns how many were written.
    ///
    /// # Errors
    ///
    /// [`AppError`] for an unknown id, several messages as one `.eml`, or when the file cannot be written.
    pub fn export(&self, ids: &[String], format: ExportFormat, path: &Path) -> Result<usize, AppError> {
        let store = self.store.lock()?;
        let messages = ids.iter().map(|id| Ok((store.get(id)?, store.raw(id)?))).collect::<Result<Vec<_>, AppError>>()?;
        drop(store);
        let bytes = render(&messages, format)?;
        fs::write(path, bytes).map_err(|source| AppError::File { path: path.display().to_string(), source })?;
        Ok(messages.len())
    }
}

/// The file's bytes for messages and their raw bytes.
fn render(messages: &[(MessageRecord, Vec<u8>)], format: ExportFormat) -> Result<Vec<u8>, AppError> {
    match format {
        ExportFormat::Eml => match messages {
            [(_, raw)] => Ok(raw.clone()),
            _ => Err(AppError::Unreadable("An .eml file holds one message; export several as .mbox.".to_owned())),
        },
        ExportFormat::Mbox => Ok(messages.iter().flat_map(|(record, raw)| mbox_entry(&record.from, record.sent_at, raw)).collect()),
        ExportFormat::Json => {
            let bodies: Vec<String> = messages.iter().map(|(_, raw)| body_text(raw)).collect();
            let exported: Vec<Exported<'_>> = messages.iter().zip(&bodies).map(|((record, _), body)| exported(record, body)).collect();
            serde_json::to_vec_pretty(&exported).map_err(|error| AppError::Unreadable(error.to_string()))
        }
        ExportFormat::Csv => {
            let mut out = CSV_COLUMNS.join(",");
            out.push_str("\r\n");
            for (record, raw) in messages {
                let body = body_text(raw);
                let cells = [
                    rfc3339(record.sent_at),
                    record.from_name.clone(),
                    record.from.clone(),
                    record.to.clone(),
                    record.subject.clone(),
                    record.placement.workspace.clone(),
                    record.placement.folder.clone().unwrap_or_default(),
                    record.tags.join("; "),
                    body,
                ];
                out.push_str(&cells.iter().map(|cell| csv_cell(cell)).collect::<Vec<_>>().join(","));
                out.push_str("\r\n");
            }
            Ok(out.into_bytes())
        }
        ExportFormat::Text => Ok(messages
            .iter()
            .map(|(record, raw)| {
                format!(
                    "Subject: {}\nFrom: {} <{}>\nTo: {}\nDate: {}\n\n{}\n",
                    record.subject,
                    record.from_name,
                    record.from,
                    record.to,
                    rfc3339(record.sent_at),
                    body_text(raw).trim_end()
                )
            })
            .collect::<Vec<_>>()
            .join("\n----------------------------------------\n\n")
            .into_bytes()),
    }
}

fn exported<'a>(record: &'a MessageRecord, body: &'a str) -> Exported<'a> {
    Exported {
        id: &record.id,
        workspace: &record.placement.workspace,
        folder: record.placement.folder.as_deref(),
        from_name: &record.from_name,
        from: &record.from,
        to: &record.to,
        subject: &record.subject,
        received_at: rfc3339(record.sent_at),
        unread: record.unread,
        starred: record.starred,
        tags: &record.tags,
        body,
    }
}

/// One CSV cell: quoted when it holds a comma, quote or line break, and with a cell that a spreadsheet would run as a
/// formula (`=`, `+`, `-`, `@`, tab, return) led by an apostrophe, so opening an export never runs what a sender wrote.
fn csv_cell(value: &str) -> String {
    let safe = if value.starts_with(['=', '+', '-', '@', '\t', '\r']) { format!("'{value}") } else { value.to_owned() };
    if safe.contains([',', '"', '\n', '\r']) { format!("\"{}\"", safe.replace('"', "\"\"")) } else { safe }
}

#[cfg(test)]
mod tests {
    use buun_mail_store::{Placement, Shelf};

    use super::*;

    fn message(subject: &str, from_name: &str) -> (MessageRecord, Vec<u8>) {
        let raw = format!("From: {from_name} <a@b.com>\r\nTo: x@acme.com\r\nSubject: {subject}\r\n\r\nHello, \"world\"\r\nFrom the start\r\n").into_bytes();
        let record = MessageRecord {
            id: "id1".to_owned(),
            placement: Placement { workspace: "acme".to_owned(), folder: None },
            matched: None,
            folder_matched: None,
            from_name: from_name.to_owned(),
            from: "a@b.com".to_owned(),
            to: "x@acme.com".to_owned(),
            subject: subject.to_owned(),
            preview: String::new(),
            sent_at: 1_795_000_000,
            message_id: None,
            unread: false,
            starred: true,
            shelf: Shelf::Active,
            tags: vec!["invoice".to_owned()],
            thread_id: None,
            thread_size: 1,
            snoozed_until: None,
        };
        (record, raw)
    }

    #[test]
    fn csv_quotes_what_needs_it_and_defuses_formulas() {
        let out = String::from_utf8(render(&[message("=HYPERLINK(\"x\")", "Ada, Inc")], ExportFormat::Csv).unwrap_or_default()).unwrap_or_default();
        let row = out.lines().nth(1).unwrap_or_default();
        assert!(out.starts_with("received_at,from_name,from,to,subject"));
        assert!(row.contains("\"Ada, Inc\""));
        assert!(row.contains("\"'=HYPERLINK(\"\"x\"\")\""));
    }

    #[test]
    fn json_carries_the_summary_and_the_text() {
        let out = render(&[message("Invoice", "Ada")], ExportFormat::Json).unwrap_or_default();
        let parsed: serde_json::Value = serde_json::from_slice(&out).unwrap_or_default();
        assert_eq!(parsed[0]["subject"], "Invoice");
        assert_eq!(parsed[0]["starred"], true);
        assert!(parsed[0]["body"].as_str().unwrap_or_default().contains("Hello"));
    }

    #[test]
    fn eml_is_one_message_and_mbox_holds_several() {
        let one = message("One", "Ada");
        assert_eq!(render(std::slice::from_ref(&one), ExportFormat::Eml).unwrap_or_default(), one.1);
        assert!(render(&[one.clone(), one.clone()], ExportFormat::Eml).is_err());
        let mbox = render(&[one.clone(), one], ExportFormat::Mbox).unwrap_or_default();
        assert_eq!(buun_mail_message::split_mbox(&mbox).len(), 2);
    }

    #[test]
    fn opens_documents_but_never_programs() {
        assert!(openable("Invoice.PDF"));
        assert!(openable("photo.jpeg"));
        assert!(!openable("setup.exe"));
        assert!(!openable("run.sh"));
        assert!(!openable("invoice.pdf.exe"));
        assert!(!openable("README"));
    }

    #[test]
    fn text_reads_like_a_letter() {
        let out = String::from_utf8(render(&[message("Hi", "Ada")], ExportFormat::Text).unwrap_or_default()).unwrap_or_default();
        assert!(out.starts_with("Subject: Hi\nFrom: Ada <a@b.com>\nTo: x@acme.com\nDate: "));
        assert!(out.contains("Hello"));
    }
}
