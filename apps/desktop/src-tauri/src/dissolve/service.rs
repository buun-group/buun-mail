//! Connecting a dissolve.email account, collecting its inboxes' mail every minute, and making, extending and
//! burning inboxes. Each inbox is a folder of the dissolve.email workspace, named by its address.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use buun_mail_message::{Contact, Outgoing, build, rfc3339, unix_of};
use buun_mail_store::Placement;
use serde::Serialize;
use tauri::AppHandle;

use super::WORKSPACE;
use super::api::{Api, ApiError, RemoteInbox, RemoteMessage};
use super::oauth::{self, Metadata, OAuthError, SIGN_IN_WAIT};
use super::settings::{self, Account, DissolveSettings, KnownInbox};
use crate::dto::MessageDto;
use crate::error::AppError;
use crate::events;
use crate::mailbox::{Actor, Mailbox, ProvidedWorkspace, unix_now};

/// How often the inboxes are checked.
const INTERVAL: Duration = Duration::from_secs(60);

/// How many inboxes' messages one check lists. dissolve.email allows five message polls a minute from one address,
/// so a check takes four and the rest come on the next, in turn, until it offers one call for every inbox.
pub const POLLS_PER_CHECK: usize = 4;

/// Refresh the access token when it has less than this left, in seconds.
const REFRESH_AHEAD: i64 = 120;

/// One inbox as the app shows it.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DissolveInboxDto {
    /// Its id on dissolve.email.
    pub id: String,
    /// Its address, which is also its folder's name.
    pub address: String,
    /// The name the person gave it.
    pub name: Option<String>,
    /// When it ends, RFC 3339.
    pub expires_at: String,
    /// True once it has ended on dissolve.email and its mail was kept here.
    pub ended: bool,
    /// Messages of it stored here.
    pub stored: usize,
}

/// The connection as Settings and the workspace header show it. Never a token.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DissolveStatusDto {
    /// True while signed in.
    pub connected: bool,
    /// The server.
    pub server: String,
    /// The account's email.
    pub email: Option<String>,
    /// The account's plan.
    pub plan: Option<String>,
    /// Keep mail after its inbox ends.
    pub keep_after_expiry: bool,
    /// Every inbox, live ones first, newest first.
    pub inboxes: Vec<DissolveInboxDto>,
    /// When it was last checked, RFC 3339.
    pub last_checked: Option<String>,
    /// What went wrong last, if anything.
    pub problem: Option<String>,
}

#[derive(Default)]
struct Progress {
    last_checked: Option<String>,
    problem: Option<String>,
    turn: usize,
}

type Opener = Box<dyn Fn(&str) -> Result<(), String> + Send + Sync>;

struct Inner {
    config_folder: PathBuf,
    settings: Mutex<DissolveSettings>,
    progress: Mutex<Progress>,
    metadata: Mutex<Option<Metadata>>,
    checking: Mutex<()>,
    mailbox: Arc<Mailbox>,
    app: Option<AppHandle>,
    open_browser: Opener,
}

/// The dissolve.email connection. Cheap to clone, so slow work runs away from the window's thread.
#[derive(Clone)]
pub struct DissolveService(Arc<Inner>);

impl DissolveService {
    /// Loads the saved account, shows its workspace, and checks every minute while connected.
    #[must_use]
    pub fn start(config_folder: PathBuf, mailbox: Arc<Mailbox>, app: Option<AppHandle>) -> Self {
        let handle = app.clone();
        let open_browser: Opener = Box::new(move |url: &str| {
            use tauri_plugin_opener::OpenerExt as _;
            handle
                .as_ref()
                .ok_or_else(|| "no window to open the browser from".to_owned())?
                .opener()
                .open_url(url, None::<&str>)
                .map_err(|error| error.to_string())
        });
        let service = Self::new(config_folder, mailbox, app, open_browser);
        let looping = service.clone();
        std::thread::spawn(move || {
            loop {
                let _ = looping.check();
                std::thread::sleep(INTERVAL);
            }
        });
        service
    }

    /// The service without its loop, opening the browser with `open_browser`.
    pub(super) fn new(config_folder: PathBuf, mailbox: Arc<Mailbox>, app: Option<AppHandle>, open_browser: Opener) -> Self {
        let saved = settings::load(&config_folder);
        let service = Self(Arc::new(Inner {
            config_folder,
            settings: Mutex::new(saved),
            progress: Mutex::default(),
            metadata: Mutex::default(),
            checking: Mutex::new(()),
            mailbox,
            app,
            open_browser,
        }));
        let _ = service.show_workspace();
        service
    }

    /// The connection and every inbox.
    ///
    /// # Errors
    ///
    /// [`AppError::Poisoned`] after an earlier failure.
    pub fn status(&self) -> Result<DissolveStatusDto, AppError> {
        let saved = self.0.settings.lock()?.clone();
        let progress = self.0.progress.lock()?;
        let mut inboxes: Vec<DissolveInboxDto> = saved
            .inboxes
            .iter()
            .map(|(id, known)| DissolveInboxDto {
                id: id.clone(),
                address: known.address.clone(),
                name: known.custom_name.clone(),
                expires_at: known.expires_at.clone(),
                ended: known.ended,
                stored: known.messages.len(),
            })
            .collect();
        inboxes.sort_by(|a, b| a.ended.cmp(&b.ended).then_with(|| b.expires_at.cmp(&a.expires_at)));
        Ok(DissolveStatusDto {
            connected: saved.account.is_some(),
            server: saved.server().to_owned(),
            email: saved.account.as_ref().and_then(|account| account.email.clone()),
            plan: saved.account.as_ref().map(|account| account.plan.clone()),
            keep_after_expiry: saved.keep_after_expiry,
            inboxes,
            last_checked: progress.last_checked.clone(),
            problem: progress.problem.clone(),
        })
    }

    /// Signs in: opens the browser at dissolve.email's approval page, waits up to five minutes for it to come back to
    /// this computer, keeps the tokens, then collects. `server` replaces the saved server when given.
    ///
    /// # Errors
    ///
    /// Why it failed, in words for Settings.
    pub fn connect(&self, server: Option<&str>) -> Result<DissolveStatusDto, String> {
        let mut saved = self.0.settings.lock().map_err(|error| error.to_string())?.clone();
        if let Some(server) = server.map(str::trim).filter(|server| !server.is_empty()) {
            check_server(server)?;
            if server.trim_end_matches('/') != saved.server() {
                saved.client_id.clear();
            }
            server.trim_end_matches('/').clone_into(&mut saved.server);
        }
        let metadata = oauth::discover(saved.server()).map_err(|error| error.to_string())?;
        if saved.client_id.is_empty() {
            saved.client_id = oauth::register(&metadata).map_err(|error| error.to_string())?;
            self.save(&saved).map_err(|error| error.to_string())?;
        }
        let loopback = oauth::Loopback::open().map_err(|error| error.to_string())?;
        let pair = oauth::pkce().map_err(|error| error.to_string())?;
        let state = oauth::random(24).map_err(|error| error.to_string())?;
        (self.0.open_browser)(&oauth::authorize_url(&metadata, &saved.client_id, &loopback.redirect, &state, &pair.challenge))?;
        let code = loopback.wait(&state, &metadata.issuer, SIGN_IN_WAIT).map_err(|error| error.to_string())?;
        let tokens = oauth::exchange(&metadata, &saved.client_id, &code, &loopback.redirect, &pair.verifier, unix_now()).map_err(|error| error.to_string())?;
        let me = Api::new(saved.server(), &tokens.access).me().map_err(|error| error.to_string())?;
        saved.account =
            Some(Account { email: me.email, plan: me.plan, access_token: tokens.access, refresh_token: tokens.refresh, expires_at: tokens.expires_at });
        self.save(&saved).map_err(|error| error.to_string())?;
        *self.0.metadata.lock().map_err(|error| error.to_string())? = Some(metadata);
        let _ = self.check();
        self.status().map_err(|error| error.to_string())
    }

    /// Signs out: revokes the tokens and forgets them. With `delete_mail`, every message collected from
    /// dissolve.email is deleted here too and the workspace goes; otherwise it stays, readable, until deleted.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the settings or the store cannot be written.
    pub fn disconnect(&self, delete_mail: bool) -> Result<DissolveStatusDto, AppError> {
        let mut saved = self.0.settings.lock()?.clone();
        if let Some(account) = saved.account.take()
            && let Ok(metadata) = self.metadata(&saved)
        {
            oauth::revoke(&metadata, &saved.client_id, &account.refresh_token);
        }
        if delete_mail {
            let ids: Vec<String> = saved.inboxes.values().flat_map(|known| known.messages.values().cloned()).collect();
            self.0.mailbox.delete_forever(&ids, &Actor::App)?;
            saved.inboxes.clear();
        }
        self.save(&saved)?;
        self.0.progress.lock()?.problem = None;
        self.show_workspace()?;
        self.announce(&[]);
        self.status()
    }

    /// Keeps, or stops keeping, an inbox's mail after it ends on dissolve.email.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the settings cannot be written.
    pub fn set_keep_after_expiry(&self, keep: bool) -> Result<DissolveStatusDto, AppError> {
        let mut saved = self.0.settings.lock()?.clone();
        saved.keep_after_expiry = keep;
        self.save(&saved)?;
        self.status()
    }

    /// Makes an inbox, on `domain` or the account's default, and gives it a folder.
    ///
    /// # Errors
    ///
    /// Why it failed, such as a plan limit, in dissolve.email's words.
    pub fn create_inbox(&self, domain: Option<&str>, name: Option<&str>) -> Result<DissolveInboxDto, String> {
        let made = self.call(|api| api.create_inbox(domain, name)).map_err(|error| error.to_string())?;
        let mut saved = self.0.settings.lock().map_err(|error| error.to_string())?.clone();
        remember(&mut saved, &made);
        self.save(&saved).map_err(|error| error.to_string())?;
        self.show_workspace().map_err(|error| error.to_string())?;
        self.announce(&[]);
        Ok(DissolveInboxDto { id: made.id, address: made.address, name: made.custom_name, expires_at: made.expires_at, ended: false, stored: 0 })
    }

    /// The domains a new inbox can be made on, the default first.
    ///
    /// # Errors
    ///
    /// Why they could not be read, in words for the window.
    pub fn domains(&self) -> Result<Vec<String>, String> {
        self.call(Api::domains).map_err(|error| error.to_string())
    }

    /// Gives an inbox more time.
    ///
    /// # Errors
    ///
    /// dissolve.email's refusal, such as too early or the plan's last extension, in its words.
    pub fn extend_inbox(&self, id: &str) -> Result<DissolveStatusDto, String> {
        let extended = self.call(|api| api.extend(id)).map_err(|error| error.to_string())?;
        let mut saved = self.0.settings.lock().map_err(|error| error.to_string())?.clone();
        if let Some(known) = saved.inboxes.get_mut(id) {
            known.expires_at = extended.expires_at;
        }
        self.save(&saved).map_err(|error| error.to_string())?;
        self.status().map_err(|error| error.to_string())
    }

    /// Burns an inbox: ends it on dissolve.email and deletes its mail here, whatever the keep setting says.
    ///
    /// # Errors
    ///
    /// Why it failed, in words for a toast.
    pub fn burn_inbox(&self, id: &str) -> Result<DissolveStatusDto, String> {
        self.call(|api| api.delete_inbox(id)).map_err(|error| error.to_string())?;
        let mut saved = self.0.settings.lock().map_err(|error| error.to_string())?.clone();
        if let Some(known) = saved.inboxes.remove(id) {
            self.0.mailbox.delete_forever(&known.messages.into_values().collect::<Vec<_>>(), &Actor::You).map_err(|error| error.to_string())?;
        }
        self.save(&saved).map_err(|error| error.to_string())?;
        self.show_workspace().map_err(|error| error.to_string())?;
        self.announce(&[]);
        self.status().map_err(|error| error.to_string())
    }

    /// Checks now: the inbox list, ended inboxes, and up to [`POLLS_PER_CHECK`] inboxes' new mail, in turn. Returns
    /// how many messages arrived. Does nothing while not connected.
    ///
    /// # Errors
    ///
    /// Why the check failed, also kept for Settings.
    pub fn check(&self) -> Result<usize, String> {
        let Ok(_one_at_a_time) = self.0.checking.lock() else { return Ok(0) };
        if self.0.settings.lock().map_err(|error| error.to_string())?.account.is_none() {
            return Ok(0);
        }
        let outcome = self.collect();
        if let Ok(mut progress) = self.0.progress.lock() {
            progress.last_checked = Some(rfc3339(unix_now()));
            progress.problem = outcome.as_ref().err().cloned();
        }
        outcome
    }

    fn collect(&self) -> Result<usize, String> {
        let remote = self.call(Api::inboxes).map_err(|error| error.to_string())?;
        let mut saved = self.0.settings.lock().map_err(|error| error.to_string())?.clone();
        for inbox in &remote {
            remember(&mut saved, inbox);
        }
        // Inboxes no longer listed have ended: their mail goes, unless the person keeps it.
        let ended: Vec<String> =
            saved.inboxes.iter().filter(|(id, known)| !known.ended && !remote.iter().any(|inbox| &inbox.id == *id)).map(|(id, _)| id.clone()).collect();
        for id in ended {
            if saved.keep_after_expiry {
                if let Some(known) = saved.inboxes.get_mut(&id) {
                    known.ended = true;
                }
            } else if let Some(known) = saved.inboxes.remove(&id) {
                self.0.mailbox.delete_forever(&known.messages.into_values().collect::<Vec<_>>(), &Actor::App).map_err(|error| error.to_string())?;
            }
        }
        let turn = self.0.progress.lock().map_or(0, |progress| progress.turn);
        let chosen: Vec<&RemoteInbox> = remote.iter().cycle().skip(turn % remote.len().max(1)).take(remote.len().min(POLLS_PER_CHECK)).collect();
        if let Ok(mut progress) = self.0.progress.lock() {
            progress.turn = turn.wrapping_add(chosen.len());
        }
        let mut arrived: Vec<MessageDto> = Vec::new();
        let mut taken = 0;
        let mut slowed = false;
        for inbox in chosen {
            let messages = match self.call(|api| api.messages(&inbox.id)) {
                Ok(messages) => messages,
                Err(ApiError::Slow) => {
                    slowed = true;
                    break;
                }
                Err(ApiError::Gone) => continue,
                Err(error) => return Err(error.to_string()),
            };
            let placement = Placement { workspace: WORKSPACE.to_owned(), folder: Some(inbox.address.clone()) };
            for message in messages {
                if saved.inboxes.get(&inbox.id).is_some_and(|known| known.messages.contains_key(&message.id)) {
                    continue;
                }
                let raw = match self.call(|api| api.source(&inbox.id, &message.id)).map_err(|error| error.to_string())? {
                    Some(raw) => raw,
                    None => stand_in(&message, &inbox.address),
                };
                let received = unix_of(&message.received_at).unwrap_or_else(unix_now);
                match self.0.mailbox.take_in_placed(&raw, &inbox.address, &placement, received) {
                    Ok((stored, announce)) => {
                        if let Some(known) = saved.inboxes.get_mut(&inbox.id) {
                            known.messages.insert(message.id.clone(), stored);
                        }
                        taken += 1;
                        arrived.extend(announce);
                    }
                    Err(error) => self.0.mailbox.note_unreadable(&format!("dissolve.email {}", message.id), &error.to_string()),
                }
            }
        }
        self.save(&saved).map_err(|error| error.to_string())?;
        self.show_workspace().map_err(|error| error.to_string())?;
        self.announce(&arrived);
        if slowed && taken == 0 {
            return Err(ApiError::Slow.to_string());
        }
        Ok(taken)
    }

    /// Runs one API call with a fresh token, refreshing once and trying again when the token was refused.
    fn call<T>(&self, run: impl Fn(&Api) -> Result<T, ApiError>) -> Result<T, ApiError> {
        let saved = self.0.settings.lock().map_err(|_| ApiError::NotConnected)?.clone();
        let Some(account) = &saved.account else { return Err(ApiError::NotConnected) };
        let token = if account.expires_at - unix_now() < REFRESH_AHEAD { self.refresh()? } else { account.access_token.clone() };
        match run(&Api::new(saved.server(), &token)) {
            Err(ApiError::Unauthorized) => run(&Api::new(saved.server(), &self.refresh()?)),
            other => other,
        }
    }

    /// New tokens from the refresh token, saved at once. Returns the new access token.
    fn refresh(&self) -> Result<String, ApiError> {
        let mut saved = self.0.settings.lock().map_err(|_| ApiError::NotConnected)?.clone();
        let metadata = self.metadata(&saved).map_err(|error| ApiError::Unreachable(error.to_string()))?;
        let Some(account) = saved.account.as_mut() else { return Err(ApiError::NotConnected) };
        let tokens = oauth::refresh(&metadata, &saved.client_id, &account.refresh_token, unix_now()).map_err(|error| match error {
            OAuthError::Refused(_) => ApiError::Unauthorized,
            other => ApiError::Unreachable(other.to_string()),
        })?;
        account.access_token.clone_from(&tokens.access);
        account.refresh_token = tokens.refresh;
        account.expires_at = tokens.expires_at;
        self.save(&saved).map_err(|error| ApiError::Unreachable(error.to_string()))?;
        Ok(tokens.access)
    }

    fn metadata(&self, saved: &DissolveSettings) -> Result<Metadata, OAuthError> {
        if let Some(known) = self.0.metadata.lock().ok().and_then(|cached| cached.clone()) {
            return Ok(known);
        }
        let found = oauth::discover(saved.server())?;
        if let Ok(mut cached) = self.0.metadata.lock() {
            *cached = Some(found.clone());
        }
        Ok(found)
    }

    fn save(&self, saved: &DissolveSettings) -> Result<(), AppError> {
        settings::save(&self.0.config_folder, saved)?;
        *self.0.settings.lock()? = saved.clone();
        Ok(())
    }

    /// Shows the workspace with a folder per inbox while connected or holding mail; takes it away otherwise.
    fn show_workspace(&self) -> Result<(), AppError> {
        let saved = self.0.settings.lock()?.clone();
        if saved.account.is_none() && saved.inboxes.is_empty() {
            return self.0.mailbox.withdraw_workspace(WORKSPACE);
        }
        let mut inboxes: Vec<&KnownInbox> = saved.inboxes.values().collect();
        inboxes.sort_by(|a, b| a.ended.cmp(&b.ended).then_with(|| b.expires_at.cmp(&a.expires_at)));
        let folders: Vec<String> = inboxes.iter().map(|known| known.address.clone()).collect();
        self.0.mailbox.provide_workspace(ProvidedWorkspace {
            id: WORKSPACE.to_owned(),
            name: "dissolve.email".to_owned(),
            icon: Some("dissolve".to_owned()),
            addresses: folders.clone(),
            folders,
        })
    }

    fn announce(&self, arrived: &[MessageDto]) {
        if let Some(app) = &self.0.app {
            events::mail_arrived(app, arrived);
            events::mail_changed(app);
        }
    }
}

/// Notes an inbox the server listed, keeping what was already collected from it.
fn remember(saved: &mut DissolveSettings, inbox: &RemoteInbox) {
    let known = saved.inboxes.entry(inbox.id.clone()).or_default();
    known.address.clone_from(&inbox.address);
    known.custom_name.clone_from(&inbox.custom_name);
    known.expires_at.clone_from(&inbox.expires_at);
    known.ended = false;
}

/// Only `https`, or plain `http` to this computer, so a token never crosses the network in the clear.
fn check_server(server: &str) -> Result<(), String> {
    let lowered = server.to_ascii_lowercase();
    let local = ["http://localhost", "http://127.0.0.1", "http://[::1]"].iter().any(|prefix| lowered.starts_with(prefix));
    if lowered.starts_with("https://") || local { Ok(()) } else { Err("the server must use https (plain http only to this computer)".to_owned()) }
}

/// A message for one whose original dissolve.email did not keep: its sender, subject and text, so it still reads.
fn stand_in(message: &RemoteMessage, address: &str) -> Vec<u8> {
    let text =
        message.body_text.clone().filter(|text| !text.trim().is_empty()).unwrap_or_else(|| "(dissolve.email did not keep this message's original.)".to_owned());
    build(&Outgoing {
        from: Contact { name: message.from_name.clone(), address: message.from_address.clone() },
        to: vec![Contact { name: None, address: address.to_owned() }],
        cc: Vec::new(),
        bcc: Vec::new(),
        reply_to: Vec::new(),
        subject: message.subject.clone().unwrap_or_default(),
        text,
        in_reply_to: None,
        references: Vec::new(),
        message_id: format!("{}@dissolve.email", message.id),
        date: unix_of(&message.received_at).unwrap_or_else(unix_now),
        attachments: Vec::new(),
    })
}
