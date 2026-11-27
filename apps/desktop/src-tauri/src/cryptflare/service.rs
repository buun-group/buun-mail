//! Connecting a `CryptFlare` organisation with OAuth (the token's audience is the REST API), choosing the workspace
//! and environment saves go to, and the switch that saves dissolve.email identities automatically. Writing is in
//! `queue`.

use std::path::PathBuf;
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

use buun_mail_message::rfc3339;
use serde::{Deserialize, Serialize};

use super::api::{Api, CfError, Named};
use super::entry;
use super::settings::{self, Account, CryptFlareSettings, Target};
use super::sign_in::{SignIn, Waiting};
use crate::dissolve::{IdentityChange, IdentityRecord};
use crate::error::AppError;
use crate::mailbox::unix_now;
use crate::oauth::{self, Metadata, SIGN_IN_WAIT};

/// What the app asks for: list and write secrets, and see the workspaces and environments to choose from. Never
/// `secrets:read`: a saved password is read from dissolve.email, never back from `CryptFlare`.
pub const SCOPES: &str = "secrets:write secrets:list workspaces:read environments:read";

/// The scope writing needs; without it the switch stays off.
const WRITE_SCOPE: &str = "secrets:write";

/// How often waiting saves are tried while nothing wakes the loop.
pub(super) const RETRY_EVERY: Duration = Duration::from_mins(5);

type Opener = Box<dyn Fn(&str) -> Result<(), String> + Send + Sync>;

pub(super) struct Inner {
    pub(super) config_folder: PathBuf,
    pub(super) settings: Mutex<CryptFlareSettings>,
    pub(super) metadata: Mutex<Option<Metadata>>,
    /// One refresh at a time: a refresh token works once, and presenting it twice disconnects the app.
    pub(super) refreshing: Mutex<()>,
    /// One pass over the waiting saves at a time.
    pub(super) writing: Mutex<()>,
    /// Why the last pass stopped, for Settings.
    pub(super) problem: Mutex<Option<String>>,
    pub(super) woken: Mutex<bool>,
    pub(super) wake: Condvar,
    pub(super) open_browser: Opener,
    /// The sign-in waiting for the browser, if any (`sign_in`).
    pub(super) signing_in: Mutex<Option<SignIn>>,
}

/// The `CryptFlare` connection. Cheap to clone, so slow work runs away from the window's thread.
#[derive(Clone)]
pub struct CryptFlareService(pub(super) Arc<Inner>);

/// A workspace and environment, as the window sees them.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TargetDto {
    /// The workspace's id.
    pub workspace_id: String,
    /// Its name.
    pub workspace_name: String,
    /// The environment's id.
    pub environment_id: String,
    /// Its name.
    pub environment_name: String,
}

/// A workspace or environment to choose.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ChoiceDto {
    /// Its id.
    pub id: String,
    /// Its name.
    pub name: String,
}

/// The connection as the window sees it: never a token or a saved value.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CryptFlareStatusDto {
    /// Signed in.
    pub connected: bool,
    /// The organisation's name.
    pub organisation: Option<String>,
    /// The grant includes writing secrets.
    pub can_write: bool,
    /// Where saves go.
    pub target: Option<TargetDto>,
    /// New and changed dissolve.email identities are saved automatically.
    pub save_identities: bool,
    /// Saves waiting to be written.
    pub pending: usize,
    /// When the last save went through, RFC 3339.
    pub last_saved: Option<String>,
    /// Why saving stopped, if it did.
    pub problem: Option<String>,
}

impl From<Named> for ChoiceDto {
    fn from(named: Named) -> Self {
        let name = if named.name.is_empty() { named.id.clone() } else { named.name };
        Self { id: named.id, name }
    }
}

impl CryptFlareService {
    /// Loads the saved connection and starts the loop that writes waiting saves.
    #[must_use]
    pub fn start(config_folder: PathBuf, app: Option<tauri::AppHandle>) -> Self {
        let open_browser: Opener = Box::new(move |url: &str| {
            use tauri_plugin_opener::OpenerExt as _;
            app.as_ref().ok_or_else(|| "no window to open the browser from".to_owned())?.opener().open_url(url, None::<&str>).map_err(|error| error.to_string())
        });
        let service = Self::new(config_folder, open_browser);
        let looping = service.clone();
        std::thread::spawn(move || looping.run());
        service
    }

    /// The service without its loop, opening the browser with `open_browser`.
    pub(super) fn new(config_folder: PathBuf, open_browser: Opener) -> Self {
        let saved = settings::load(&config_folder);
        Self(Arc::new(Inner {
            config_folder,
            settings: Mutex::new(saved),
            metadata: Mutex::default(),
            refreshing: Mutex::new(()),
            writing: Mutex::new(()),
            problem: Mutex::default(),
            woken: Mutex::new(false),
            wake: Condvar::new(),
            open_browser,
            signing_in: Mutex::new(None),
        }))
    }

    pub(super) fn save(&self, saved: &CryptFlareSettings) -> Result<(), AppError> {
        settings::save(&self.0.config_folder, saved)?;
        *self.0.settings.lock()? = saved.clone();
        Ok(())
    }

    pub(super) fn snapshot(&self) -> Result<CryptFlareSettings, String> {
        Ok(self.0.settings.lock().map_err(|error| error.to_string())?.clone())
    }

    /// The connection, where saves go, and what is waiting.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the settings cannot be read.
    pub fn status(&self) -> Result<CryptFlareStatusDto, AppError> {
        let saved = self.0.settings.lock()?.clone();
        let problem = self.0.problem.lock()?.clone().or_else(|| saved.pending.values().find_map(|save| save.problem.clone()));
        Ok(CryptFlareStatusDto {
            connected: saved.account.is_some(),
            organisation: saved.account.as_ref().map(|account| account.org_name.clone()),
            can_write: saved.account.as_ref().is_some_and(|account| account.scope.split_whitespace().any(|scope| scope == WRITE_SCOPE)),
            target: saved.target.map(|target| TargetDto {
                workspace_id: target.workspace_id,
                workspace_name: target.workspace_name,
                environment_id: target.environment_id,
                environment_name: target.environment_name,
            }),
            save_identities: saved.save_identities,
            pending: saved.pending.len(),
            last_saved: saved.last_saved,
            problem,
        })
    }

    pub(super) fn metadata(&self, saved: &CryptFlareSettings) -> Result<Metadata, String> {
        if let Some(known) = self.0.metadata.lock().ok().and_then(|cached| cached.clone()) {
            return Ok(known);
        }
        let found = oauth::discover(saved.issuer()).map_err(|error| error.to_string())?;
        if let Ok(mut cached) = self.0.metadata.lock() {
            *cached = Some(found.clone());
        }
        Ok(found)
    }

    /// Signs in: opens the browser at `CryptFlare`'s approval page, where the person picks the organisation, the
    /// workspaces and the scopes, then keeps the tokens. `issuer` and `api` replace the saved servers when given.
    ///
    /// # Errors
    ///
    /// Why it failed, in words for Settings.
    pub fn connect(&self, issuer: Option<&str>, api: Option<&str>) -> Result<CryptFlareStatusDto, String> {
        let mut saved = self.snapshot()?;
        let before = (saved.client_id.clone(), saved.account.as_ref().map(|account| account.refresh_token.clone()));
        if let Some(issuer) = issuer.map(str::trim).filter(|issuer| !issuer.is_empty()) {
            if issuer.trim_end_matches('/') != saved.issuer() {
                saved.client_id.clear();
                *self.0.metadata.lock().map_err(|error| error.to_string())? = None;
            }
            issuer.trim_end_matches('/').clone_into(&mut saved.issuer);
        }
        if let Some(api) = api.map(str::trim).filter(|api| !api.is_empty()) {
            api.trim_end_matches('/').clone_into(&mut saved.api);
        }
        let metadata = self.metadata(&saved)?;
        if saved.client_id.is_empty() || saved.client_redirect != oauth::REGISTERED_REDIRECT {
            saved.client_id = oauth::register(&metadata).map_err(|error| error.to_string())?;
            oauth::REGISTERED_REDIRECT.clone_into(&mut saved.client_redirect);
            self.save(&saved).map_err(|error| error.to_string())?;
        }
        let way_back = oauth::Return::open().map_err(|error| error.to_string())?;
        let pair = oauth::pkce().map_err(|error| error.to_string())?;
        let state = oauth::random(24).map_err(|error| error.to_string())?;
        let api_base = saved.api().to_owned();
        let request = oauth::Request {
            client_id: &saved.client_id,
            redirect: way_back.redirect(),
            state: &state,
            challenge: &pair.challenge,
            scopes: SCOPES,
            resource: Some(&api_base),
        };
        // Kept while the browser is out, so the window can open it again, copy it or cancel; dropped on every way out.
        let waiting = Waiting::start(self, oauth::authorize_url(&metadata, &request));
        // A browser that will not open is not the end: the window offers the link to copy into one.
        let _ = (self.0.open_browser)(waiting.url());
        let code = way_back.wait_or_cancel(&state, &metadata.issuer, SIGN_IN_WAIT, waiting.cancel()).map_err(|error| error.to_string())?;
        drop(waiting);
        let tokens = oauth::exchange(&metadata, &request, &code, &pair.verifier, unix_now()).map_err(|error| error.to_string())?;
        let who = Api::new(&api_base, &tokens.access).whoami().map_err(|error| error.to_string())?;
        // Another organisation: the workspace chosen before is not there.
        if saved.account.as_ref().is_some_and(|account| account.org_id != who.org_id) {
            saved.target = None;
        }
        saved.account = Some(Account {
            org_name: who.organisation.map(|organisation| organisation.name).filter(|name| !name.is_empty()).unwrap_or_else(|| who.org_id.clone()),
            org_id: who.org_id,
            scope: tokens.scope.unwrap_or_else(|| SCOPES.to_owned()),
            access_token: tokens.access,
            refresh_token: tokens.refresh,
            expires_at: tokens.expires_at,
        });
        self.save(&saved).map_err(|error| error.to_string())?;
        if let (old_client, Some(old_refresh)) = before
            && !old_client.is_empty()
            && old_client != saved.client_id
        {
            oauth::revoke(&metadata, &old_client, &old_refresh);
        }
        *self.0.problem.lock().map_err(|error| error.to_string())? = None;
        self.wake();
        self.status().map_err(|error| error.to_string())
    }

    /// Signs out: hands the refresh token back and forgets it, with every save still waiting (they hold passwords).
    ///
    /// # Errors
    ///
    /// [`AppError`] when the settings cannot be written.
    pub fn disconnect(&self) -> Result<CryptFlareStatusDto, AppError> {
        let mut saved = self.0.settings.lock()?.clone();
        if let Some(account) = saved.account.take()
            && let Ok(metadata) = self.metadata(&saved)
        {
            oauth::revoke(&metadata, &saved.client_id, &account.refresh_token);
        }
        saved.pending.clear();
        saved.save_identities = false;
        self.save(&saved)?;
        *self.0.problem.lock()? = None;
        self.status()
    }

    /// The workspaces the grant allows.
    ///
    /// # Errors
    ///
    /// Why they could not be read, in words.
    pub fn workspaces(&self) -> Result<Vec<ChoiceDto>, String> {
        let org = self.org()?;
        Ok(self.call(|api| api.workspaces(&org)).map_err(|error| error.to_string())?.into_iter().map(ChoiceDto::from).collect())
    }

    /// A workspace's environments.
    ///
    /// # Errors
    ///
    /// Why they could not be read, in words.
    pub fn environments(&self, workspace: &str) -> Result<Vec<ChoiceDto>, String> {
        let org = self.org()?;
        Ok(self.call(|api| api.environments(&org, workspace)).map_err(|error| error.to_string())?.into_iter().map(ChoiceDto::from).collect())
    }

    fn org(&self) -> Result<String, String> {
        self.snapshot()?.account.map(|account| account.org_id).ok_or_else(|| CfError::NotConnected.to_string())
    }

    /// Chooses where saves go, and writes anything waiting there.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the settings cannot be written.
    pub fn set_target(&self, target: TargetDto) -> Result<CryptFlareStatusDto, AppError> {
        let mut saved = self.0.settings.lock()?.clone();
        saved.target = Some(Target {
            workspace_id: target.workspace_id,
            workspace_name: target.workspace_name,
            environment_id: target.environment_id,
            environment_name: target.environment_name,
        });
        self.save(&saved)?;
        *self.0.problem.lock()? = None;
        self.wake();
        self.status()
    }

    /// Saves new and changed dissolve.email identities automatically, or stops.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the settings cannot be written.
    pub fn set_save_identities(&self, on: bool) -> Result<CryptFlareStatusDto, AppError> {
        let mut saved = self.0.settings.lock()?.clone();
        saved.save_identities = on;
        self.save(&saved)?;
        self.status()
    }

    /// Hears an identity change: queued, then written in the background, while saving identities is on and an
    /// organisation is connected. Never blocks the caller.
    pub fn identity_changed(&self, change: &IdentityChange) {
        let Ok(mut saved) = self.snapshot() else { return };
        if !saved.save_identities || saved.account.is_none() {
            return;
        }
        let Some((key, save)) = entry::save_for(change, &saved.written, &rfc3339(unix_now())) else { return };
        entry::queue(&mut saved.pending, key, save);
        if self.save(&saved).is_ok() {
            self.wake();
        }
    }

    /// Queues every identity given (each read with its password), for saving the ones made before the switch was on.
    /// Returns how many were queued.
    ///
    /// # Errors
    ///
    /// Why nothing could be queued, such as not connected.
    pub fn save_identities_now(&self, records: Vec<IdentityRecord>) -> Result<usize, String> {
        let mut saved = self.snapshot()?;
        if saved.account.is_none() {
            return Err(CfError::NotConnected.to_string());
        }
        let mut queued = 0;
        for record in records {
            if let Some((key, save)) = entry::save_for(&IdentityChange::Saved(record), &saved.written, "") {
                entry::queue(&mut saved.pending, key, save);
                queued += 1;
            }
        }
        self.save(&saved).map_err(|error| error.to_string())?;
        self.wake();
        Ok(queued)
    }

    /// Wakes the loop to write at once.
    pub(super) fn wake(&self) {
        if let Ok(mut woken) = self.0.woken.lock() {
            *woken = true;
            self.0.wake.notify_all();
        }
    }
}
