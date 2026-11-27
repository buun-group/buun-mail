//! The sign-in waiting for the browser: its approval address, so the window can open it again (the person closed the
//! tab) or copy it into another browser, and a flag that cancels the wait. Any browser on this computer can finish it:
//! the loopback listener takes the answer from whichever one comes back.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use super::service::CryptFlareService;

/// A sign-in in progress.
pub(super) struct SignIn {
    /// The approval address the browser was sent to.
    url: String,
    /// Set to stop waiting.
    cancel: Arc<AtomicBool>,
}

/// Holds a sign-in open while `connect` waits, and clears it however the wait ends.
pub(super) struct Waiting<'a> {
    service: &'a CryptFlareService,
    url: String,
    cancel: Arc<AtomicBool>,
}

impl<'a> Waiting<'a> {
    /// Opens a sign-in for `url`, replacing any before it (which is cancelled).
    pub(super) fn start(service: &'a CryptFlareService, url: String) -> Self {
        let cancel = Arc::new(AtomicBool::new(false));
        if let Ok(mut current) = service.0.signing_in.lock() {
            if let Some(before) = current.take() {
                before.cancel.store(true, Ordering::Relaxed);
            }
            *current = Some(SignIn { url: url.clone(), cancel: Arc::clone(&cancel) });
        }
        Self { service, url, cancel }
    }

    /// The approval address.
    pub(super) fn url(&self) -> &str {
        &self.url
    }

    /// The flag the wait checks.
    pub(super) fn cancel(&self) -> &AtomicBool {
        &self.cancel
    }
}

impl Drop for Waiting<'_> {
    fn drop(&mut self) {
        if let Ok(mut current) = self.service.0.signing_in.lock()
            && current.as_ref().is_some_and(|open| Arc::ptr_eq(&open.cancel, &self.cancel))
        {
            *current = None;
        }
    }
}

impl CryptFlareService {
    /// The approval address of the sign-in waiting for the browser, if one is, to copy into another browser.
    #[must_use]
    pub fn sign_in_link(&self) -> Option<String> {
        self.0.signing_in.lock().ok()?.as_ref().map(|open| open.url.clone())
    }

    /// Opens the waiting sign-in's approval page in the browser again, after the tab was closed.
    ///
    /// # Errors
    ///
    /// When no sign-in is waiting, or the browser cannot be opened.
    pub fn reopen_sign_in(&self) -> Result<(), String> {
        let url = self.sign_in_link().ok_or_else(|| "no sign-in is waiting".to_owned())?;
        (self.0.open_browser)(&url)
    }

    /// Stops waiting for the browser; the sign-in ends with "sign-in cancelled" within a second.
    pub fn cancel_sign_in(&self) {
        if let Ok(current) = self.0.signing_in.lock()
            && let Some(open) = current.as_ref()
        {
            open.cancel.store(true, Ordering::Relaxed);
        }
    }
}
