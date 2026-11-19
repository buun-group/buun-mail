//! Events the Rust side sends the UI unasked. The UI listens in `ui/src/api/events.ts`; keep the names in step.

use tauri::{AppHandle, Emitter};

use crate::dto::MessageDto;

/// New mail was stored. The payload is the new messages, newest first. Every source emits it after ingesting, so
/// notifications work the same for an import, the Worker sync and IMAP.
pub const MAIL_ARRIVED: &str = "mail-arrived";

/// Mail, tags, rules or read state changed outside the window, such as by an agent. No payload: the window reloads.
pub const MAIL_CHANGED: &str = "mail-changed";

/// Tells the UI that something changed under it. Dropped on failure for the same reason as [`mail_arrived`].
pub fn mail_changed(app: &AppHandle) {
    let _ = app.emit(MAIL_CHANGED, ());
}

/// Tells the UI about new mail. Nothing is sent for an empty batch. A failure to emit is not worth failing the import
/// for, so it is dropped: the mail is stored either way and shows on the next refresh.
pub fn mail_arrived(app: &AppHandle, messages: &[MessageDto]) {
    if !messages.is_empty() {
        let _ = app.emit(MAIL_ARRIVED, messages);
    }
}
