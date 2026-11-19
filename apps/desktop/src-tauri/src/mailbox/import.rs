//! Importing `.eml` and `.mbox` files through the one ingest path.

use std::fs;
use std::path::PathBuf;

use super::{Mailbox, unix_now};
use crate::dto::{ImportFailureDto, ImportReportDto, MessageDto};
use crate::error::AppError;
use crate::ingest::{Incoming, ingest, messages_in};
use crate::paths::file_error;

impl Mailbox {
    /// Imports `.eml` and `.mbox` files. One bad message never stops the rest; each failure is reported. Returns the
    /// report and the messages that were new, newest first, for notifications; mail a rule keeps quiet is left out.
    ///
    /// # Errors
    ///
    /// [`AppError`] only when the mailbox itself is unavailable.
    pub fn import_files(&self, files: &[PathBuf]) -> Result<(ImportReportDto, Vec<MessageDto>), AppError> {
        let router = self.router.read()?;
        let rules = self.rules.read()?;
        let store = self.store.lock()?;
        let now = unix_now();
        let mut report = ImportReportDto::default();
        let mut arrived = Vec::new();

        for file in files {
            let name = file.file_name().map_or_else(|| file.display().to_string(), |name| name.to_string_lossy().into_owned());
            let bytes = match fs::read(file) {
                Ok(bytes) => bytes,
                Err(source) => {
                    report.failed.push(ImportFailureDto { source: name, reason: file_error(file, source).to_string() });
                    continue;
                }
            };
            let messages = messages_in(&bytes);
            let many = messages.len() > 1;
            for (index, raw) in messages.iter().enumerate() {
                match ingest(Incoming { raw, envelope_to: None, received_at: now }, &router, &rules, &store) {
                    Ok(Some(new)) => {
                        report.added += 1;
                        if !new.quiet {
                            arrived.push(MessageDto::from(new.record));
                        }
                    }
                    Ok(None) => report.duplicates += 1,
                    Err(error) => {
                        let source = if many { format!("{name}, message {}", index + 1) } else { name.clone() };
                        report.failed.push(ImportFailureDto { source, reason: error.to_string() });
                    }
                }
            }
        }
        arrived.sort_by(|a, b| b.received_at.cmp(&a.received_at));
        Ok((report, arrived))
    }
}
