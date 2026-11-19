//! Collecting from IMAP mailboxes: every two minutes, or now when asked, each mailbox's new messages are fetched
//! (never marked read there) and taken in like any other mail.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::AppHandle;

use super::client::{ImapError, ImapSecurity, ImapSession};
use super::settings::{self, ImapAccount};
use crate::dto::MessageDto;
use crate::error::AppError;
use crate::events;
use crate::mailbox::{Mailbox, unix_now};

/// How often every mailbox is checked.
const INTERVAL: Duration = Duration::from_secs(120);

/// How many of a mailbox's newest messages the first collection takes; older mail stays on the server.
pub const FIRST_TAKE: usize = 200;

/// One mailbox as Settings shows it: never its password.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImapAccountDto {
    /// Its id.
    pub id: String,
    /// What the person calls it.
    pub name: String,
    /// The server.
    pub host: String,
    /// The port.
    pub port: u16,
    /// The sign-in name.
    pub username: String,
    /// The folder collected.
    pub folder: String,
    /// When it was last checked, RFC 3339.
    pub last_checked: Option<String>,
    /// Messages taken in from it since the app started.
    pub received: u32,
    /// What went wrong on its last check, if anything.
    pub problem: Option<String>,
}

#[derive(Debug, Clone, Default)]
struct Progress {
    last_checked: Option<String>,
    received: u32,
    problem: Option<String>,
}

struct Inner {
    config_folder: PathBuf,
    accounts: Mutex<Vec<ImapAccount>>,
    progress: Mutex<HashMap<String, Progress>>,
    checking: Mutex<()>,
    mailbox: Arc<Mailbox>,
    app: Option<AppHandle>,
}

/// The IMAP mailboxes and their collection. Cheap to clone, so a check can run away from the window's thread.
#[derive(Clone)]
pub struct ImapService(Arc<Inner>);

impl ImapService {
    /// Loads the saved mailboxes and starts checking them every two minutes. `app` lets it announce new mail.
    #[must_use]
    pub fn start(config_folder: PathBuf, mailbox: Arc<Mailbox>, app: Option<AppHandle>) -> Self {
        let accounts = Mutex::new(settings::load(&config_folder));
        let service = Self(Arc::new(Inner { config_folder, accounts, progress: Mutex::new(HashMap::new()), checking: Mutex::new(()), mailbox, app }));
        let looping = service.clone();
        std::thread::spawn(move || {
            loop {
                looping.check_all();
                std::thread::sleep(INTERVAL);
            }
        });
        service
    }

    /// Every mailbox with how its checks are going.
    ///
    /// # Errors
    ///
    /// [`AppError::Poisoned`] after an earlier failure.
    pub fn list(&self) -> Result<Vec<ImapAccountDto>, AppError> {
        let accounts = self.0.accounts.lock()?;
        let progress = self.0.progress.lock()?;
        Ok(accounts
            .iter()
            .map(|account| {
                let seen = progress.get(&account.id).cloned().unwrap_or_default();
                ImapAccountDto {
                    id: account.id.clone(),
                    name: account.name.clone(),
                    host: account.host.clone(),
                    port: account.port,
                    username: account.username.clone(),
                    folder: account.folder.clone(),
                    last_checked: seen.last_checked,
                    received: seen.received,
                    problem: seen.problem,
                }
            })
            .collect())
    }

    /// Signs in to check the settings, saves the mailbox, and collects its newest messages.
    ///
    /// # Errors
    ///
    /// The refusal in words: the server cannot be reached, refused the sign-in, or has no such folder.
    #[allow(clippy::too_many_arguments, reason = "each is one field of the form")]
    pub fn add(
        &self,
        name: &str,
        host: &str,
        port: u16,
        security: ImapSecurity,
        username: &str,
        password: &str,
        folder: &str,
    ) -> Result<Vec<ImapAccountDto>, String> {
        let folder = if folder.trim().is_empty() { "INBOX" } else { folder.trim() };
        let mut session = ImapSession::connect(host.trim(), port, security).map_err(|error| error.to_string())?;
        session.login(username.trim(), password).map_err(|error| error.to_string())?;
        session.examine(folder).map_err(|error| error.to_string())?;
        session.logout();
        {
            let mut accounts = self.0.accounts.lock().map_err(|_| AppError::Poisoned.to_string())?;
            let name = if name.trim().is_empty() { username.trim().to_owned() } else { name.trim().to_owned() };
            accounts.push(ImapAccount {
                id: format!("imap-{}", unix_now()),
                name,
                host: host.trim().to_owned(),
                port,
                security,
                username: username.trim().to_owned(),
                password: password.to_owned(),
                folder: folder.to_owned(),
                uid_validity: 0,
                last_uid: 0,
            });
            settings::save(&self.0.config_folder, &accounts).map_err(|error| error.to_string())?;
        }
        self.check_all();
        self.list().map_err(|error| error.to_string())
    }

    /// Forgets a mailbox. Mail already taken in stays.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the settings cannot be saved.
    pub fn remove(&self, id: &str) -> Result<Vec<ImapAccountDto>, AppError> {
        {
            let mut accounts = self.0.accounts.lock()?;
            accounts.retain(|account| account.id != id);
            settings::save(&self.0.config_folder, &accounts)?;
        }
        self.0.progress.lock()?.remove(id);
        self.list()
    }

    /// Checks every mailbox once, records how each went, announces what arrived, and returns how many did.
    pub fn check_all(&self) -> usize {
        let Ok(_one_at_a_time) = self.0.checking.lock() else { return 0 };
        let accounts = self.0.accounts.lock().map(|accounts| accounts.clone()).unwrap_or_default();
        let mut arrived = Vec::new();
        for account in accounts {
            let outcome = collect(&account, &self.0.mailbox);
            if let Ok(mut progress) = self.0.progress.lock() {
                let entry = progress.entry(account.id.clone()).or_default();
                entry.last_checked = Some(buun_mail_message::rfc3339(unix_now()));
                match &outcome {
                    Ok((_, _, found)) => {
                        entry.problem = None;
                        entry.received += u32::try_from(found.len()).unwrap_or(u32::MAX);
                    }
                    Err(error) => entry.problem = Some(error.to_string()),
                }
            }
            if let Ok((uid_validity, last_uid, found)) = outcome {
                if let Ok(mut accounts) = self.0.accounts.lock()
                    && let Some(saved) = accounts.iter_mut().find(|saved| saved.id == account.id)
                {
                    saved.uid_validity = uid_validity;
                    saved.last_uid = last_uid;
                    let _ = settings::save(&self.0.config_folder, &accounts);
                }
                arrived.extend(found);
            }
        }
        if let Some(app) = &self.0.app {
            events::mail_arrived(app, &arrived);
            if !arrived.is_empty() {
                events::mail_changed(app);
            }
        }
        arrived.len()
    }
}

/// One collection from one mailbox: the messages after the last one taken (or its newest [`FIRST_TAKE`] the first time,
/// or when the server renumbered them), never marked read on the server. Returns the folder's UIDVALIDITY, the
/// highest number now taken, and what arrived to announce.
pub(super) fn collect(account: &ImapAccount, mailbox: &Mailbox) -> Result<(u32, u32, Vec<MessageDto>), ImapError> {
    let mut session = ImapSession::connect(&account.host, account.port, account.security)?;
    session.login(&account.username, &account.password)?;
    let opened = session.examine(&account.folder)?;
    let start = if opened.uid_validity == account.uid_validity { account.last_uid } else { 0 };
    let mut uids = session.uids_after(start)?;
    if start == 0 && uids.len() > FIRST_TAKE {
        uids.drain(..uids.len() - FIRST_TAKE);
    }
    let mut last = start;
    let mut arrived = Vec::new();
    for uid in uids {
        if let Some(raw) = session.fetch(uid)? {
            match mailbox.take_in_from_headers(&raw, unix_now()) {
                Ok(Some(message)) => arrived.push(message),
                Ok(None) => {}
                Err(error) => mailbox.note_unreadable(&format!("{} message {uid}", account.name), &error.to_string()),
            }
        }
        last = uid;
    }
    session.logout();
    Ok((opened.uid_validity, last, arrived))
}
