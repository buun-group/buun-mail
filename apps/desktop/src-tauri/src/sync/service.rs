//! The sync loop: one thread that checks the gateway every half minute, or at once when woken.

use std::path::PathBuf;
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::Duration;

use serde::Serialize;
use tauri::AppHandle;

use super::gateway::{GatewayClient, GatewayError};
use super::settings::GatewaySettings;
use crate::dto::MessageDto;
use crate::error::AppError;
use crate::events;
use crate::mailbox::{Mailbox, unix_now};

/// How long the loop waits between checks.
const INTERVAL: Duration = Duration::from_secs(30);

/// The gateway connection, as Settings shows it.
#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GatewayStatusDto {
    /// True when a gateway is saved.
    pub connected: bool,
    /// The gateway's address, when connected.
    pub url: Option<String>,
    /// When it last checked, RFC 3339.
    pub last_checked: Option<String>,
    /// Messages taken in since the app started.
    pub received: u32,
    /// What went wrong on the last check, if anything.
    pub problem: Option<String>,
}

/// The shared state between the commands and the loop.
struct Shared {
    settings: Mutex<Option<GatewaySettings>>,
    status: Mutex<GatewayStatusDto>,
    wake: Condvar,
    woken: Mutex<bool>,
}

/// The sync service: owns the loop thread and the settings.
pub struct SyncService {
    shared: Arc<Shared>,
    config_folder: PathBuf,
}

impl SyncService {
    /// Loads any saved gateway and starts the loop. `app` lets it announce new mail; tests pass none.
    #[must_use]
    pub fn start(config_folder: PathBuf, mailbox: Arc<Mailbox>, app: Option<AppHandle>) -> Self {
        let settings = GatewaySettings::load(&config_folder);
        let status = GatewayStatusDto { connected: settings.is_some(), url: settings.as_ref().map(|saved| saved.url.clone()), ..GatewayStatusDto::default() };
        let shared = Arc::new(Shared { settings: Mutex::new(settings), status: Mutex::new(status), wake: Condvar::new(), woken: Mutex::new(true) });
        let looping = Arc::clone(&shared);
        thread::spawn(move || run(&looping, &mailbox, app.as_ref()));
        Self { shared, config_folder }
    }

    /// The connection's status.
    ///
    /// # Errors
    ///
    /// [`AppError::Poisoned`] after an earlier failure.
    pub fn status(&self) -> Result<GatewayStatusDto, AppError> {
        Ok(self.shared.status.lock()?.clone())
    }

    /// Checks the address and token against the gateway, saves them and starts collecting.
    ///
    /// # Errors
    ///
    /// The gateway's refusal or unreachability, in words; or [`AppError`] when the settings cannot be saved.
    pub fn connect(&self, url: &str, token: &str) -> Result<GatewayStatusDto, String> {
        let url = url.trim().trim_end_matches('/');
        if !(url.starts_with("https://") || url.starts_with("http://localhost") || url.starts_with("http://127.0.0.1")) {
            return Err("The gateway address must start with https:// (or http://localhost for one on this computer).".to_owned());
        }
        GatewayClient::new(url, token).waiting().map_err(|error| error.to_string())?;
        let settings = GatewaySettings { url: url.to_owned(), token: token.trim().to_owned() };
        settings.save(&self.config_folder).map_err(|error| error.to_string())?;
        *self.shared.settings.lock().map_err(|_| AppError::Poisoned.to_string())? = Some(settings);
        if let Ok(mut status) = self.shared.status.lock() {
            *status = GatewayStatusDto { connected: true, url: Some(url.to_owned()), ..GatewayStatusDto::default() };
        }
        self.check_now();
        self.status().map_err(|error| error.to_string())
    }

    /// Forgets the gateway. Mail already taken in stays.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the settings file cannot be removed.
    pub fn disconnect(&self) -> Result<GatewayStatusDto, AppError> {
        GatewaySettings::forget(&self.config_folder)?;
        *self.shared.settings.lock()? = None;
        *self.shared.status.lock()? = GatewayStatusDto::default();
        self.status()
    }

    /// Wakes the loop for a check now.
    pub fn check_now(&self) {
        if let Ok(mut woken) = self.shared.woken.lock() {
            *woken = true;
            self.shared.wake.notify_all();
        }
    }
}

/// The loop: check when woken or every [`INTERVAL`], record how it went, announce what arrived.
fn run(shared: &Shared, mailbox: &Mailbox, app: Option<&AppHandle>) {
    loop {
        {
            let Ok(woken) = shared.woken.lock() else { return };
            let Ok((mut woken, _)) = shared.wake.wait_timeout_while(woken, INTERVAL, |woken| !*woken) else { return };
            *woken = false;
        }
        let Some(settings) = shared.settings.lock().ok().and_then(|settings| settings.clone()) else { continue };
        let outcome = collect(&GatewayClient::new(&settings.url, &settings.token), mailbox);
        if let Ok(mut status) = shared.status.lock() {
            status.last_checked = Some(buun_mail_message::rfc3339(unix_now()));
            match &outcome {
                Ok(arrived) => {
                    status.problem = None;
                    status.received += u32::try_from(arrived.len()).unwrap_or(u32::MAX);
                }
                Err(error) => status.problem = Some(error.to_string()),
            }
        }
        if let (Ok(arrived), Some(app)) = (outcome, app) {
            events::mail_arrived(app, &arrived);
            events::mail_changed(app);
        }
    }
}

/// One check: take in every waiting message, then acknowledge the ones now safe here. A message that cannot be read
/// is acknowledged too, after it is logged, so one bad message never blocks the queue; the gateway would only offer it
/// again forever. Returns what arrived and should be announced.
pub(super) fn collect(client: &GatewayClient, mailbox: &Mailbox) -> Result<Vec<MessageDto>, GatewayError> {
    let waiting = client.waiting()?;
    let mut done = Vec::with_capacity(waiting.len());
    let mut arrived = Vec::new();
    for message in waiting {
        let raw = client.raw(&message.id)?;
        let received_at = message.received_at / 1000;
        match mailbox.take_in(&raw, &message.envelope_to, received_at) {
            Ok(Some(new)) => arrived.push(new),
            Ok(None) => {}
            Err(error) => mailbox.note_unreadable(&message.id, &error.to_string()),
        }
        done.push(message.id);
    }
    client.acknowledge(&done)?;
    Ok(arrived)
}
