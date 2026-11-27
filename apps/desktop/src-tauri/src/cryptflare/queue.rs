//! Writing the waiting saves to `CryptFlare`, one pass at a time: create the secret, or on `409` a new version, then
//! its description and metadata. A save stays queued (sealed, on disk) until it is written, so an identity made while
//! offline or signed out is written later. Tokens are refreshed one at a time and saved before they are used.

use buun_mail_message::rfc3339;

use super::api::{Api, CfError, Place, Write};
use super::service::{CryptFlareService, RETRY_EVERY};
use super::settings::Pending;
use crate::mailbox::unix_now;
use crate::oauth;

/// Refresh when the access token has less than this left, in seconds.
const REFRESH_AHEAD: i64 = 60;

/// The longest wait between tries of one save, in seconds.
const MAX_BACKOFF: i64 = 60 * 60;

/// The first wait after a failed try, in seconds; doubled each time.
const FIRST_BACKOFF: i64 = 30;

/// How a pass ended.
enum Stop {
    /// Every due save was tried.
    Done,
    /// A refusal that the next save would meet too: stop, and say why.
    Halt(String),
}

impl CryptFlareService {
    /// The loop: writes waiting saves when woken, and every few minutes while any wait.
    pub(super) fn run(&self) {
        loop {
            let _ = self.flush(false);
            let Ok(woken) = self.0.woken.lock() else { return };
            let (mut woken, _) = self.0.wake.wait_timeout_while(woken, RETRY_EVERY, |woken| !*woken).unwrap_or_else(std::sync::PoisonError::into_inner);
            *woken = false;
        }
    }

    /// Writes every save that is due (every one with `force`). Returns how many were written.
    ///
    /// # Errors
    ///
    /// Why the pass stopped, also kept for Settings.
    pub fn flush(&self, force: bool) -> Result<usize, String> {
        let Ok(_one_at_a_time) = self.0.writing.lock() else { return Ok(0) };
        let saved = self.snapshot()?;
        let (Some(account), Some(target)) = (saved.account.clone(), saved.target.clone()) else { return Ok(0) };
        let now = unix_now();
        let due: Vec<(String, Pending)> =
            saved.pending.iter().filter(|(_, save)| force || save.next_at <= now).map(|(key, save)| (key.clone(), save.clone())).collect();
        let mut written = 0;
        let mut stop = Stop::Done;
        for (key, save) in due {
            let place = Place { org: &account.org_id, workspace: &target.workspace_id, environment: &target.environment_id };
            match self.call(|api| write_one(api, place, &key, &save)) {
                Ok(()) => self.settled(&key, &save)?,
                // Metadata for a secret that is not there (an identity never saved): nothing left to do.
                Err(CfError::NotFound(_)) if save.value.is_empty() => self.settled(&key, &save)?,
                Err(CfError::Limited(seconds)) => {
                    self.retry_later(&key, seconds, None)?;
                    break;
                }
                Err(error @ (CfError::Forbidden(_) | CfError::Unauthorized | CfError::NotConnected)) => {
                    // Every other save would meet the same refusal: stop here, and keep them all for later.
                    self.retry_later(&key, MAX_BACKOFF, Some(error.to_string()))?;
                    stop = Stop::Halt(error.to_string());
                    break;
                }
                Err(error) => {
                    let backoff = (FIRST_BACKOFF << save.attempts.min(10)).min(MAX_BACKOFF);
                    self.retry_later(&key, backoff, Some(error.to_string()))?;
                    continue;
                }
            }
            written += 1;
        }
        let problem = match stop {
            Stop::Done => None,
            Stop::Halt(words) => Some(words),
        };
        self.0.problem.lock().map_err(|error| error.to_string())?.clone_from(&problem);
        problem.map_or(Ok(written), Err)
    }

    /// A save done: out of the queue, its metadata remembered.
    fn settled(&self, key: &str, save: &Pending) -> Result<(), String> {
        let mut saved = self.snapshot()?;
        // Only take it off if no newer save of the same key came in meanwhile.
        if saved.pending.get(key).is_some_and(|waiting| waiting.value == save.value && waiting.metadata == save.metadata) {
            saved.pending.remove(key);
        }
        saved.written.insert(key.to_owned(), save.metadata.clone());
        saved.last_saved = Some(rfc3339(unix_now()));
        self.save(&saved).map_err(|error| error.to_string())
    }

    fn retry_later(&self, key: &str, seconds: i64, problem: Option<String>) -> Result<(), String> {
        let mut saved = self.snapshot()?;
        if let Some(waiting) = saved.pending.get_mut(key) {
            waiting.attempts = waiting.attempts.saturating_add(1);
            waiting.next_at = unix_now() + seconds;
            waiting.problem = problem;
        }
        self.save(&saved).map_err(|error| error.to_string())
    }

    /// Runs `call` with a fresh token, refreshing once and trying again when the token is refused.
    pub(super) fn call<T>(&self, call: impl Fn(&Api) -> Result<T, CfError>) -> Result<T, CfError> {
        let token = self.token(false)?;
        let api_base = self.snapshot().map_err(|_| CfError::NotConnected)?.api().to_owned();
        match call(&Api::new(&api_base, &token)) {
            Err(CfError::Unauthorized) => call(&Api::new(&api_base, &self.token(true)?)),
            other => other,
        }
    }

    /// The access token, refreshed first when it is about to end (or `force`). One refresh at a time: whoever waited
    /// for the lock uses the token the refresh before it saved.
    fn token(&self, force: bool) -> Result<String, CfError> {
        let fresh = |saved: &super::settings::CryptFlareSettings| {
            saved.account.as_ref().filter(|account| account.expires_at - REFRESH_AHEAD > unix_now()).map(|account| account.access_token.clone())
        };
        let before = self.snapshot().map_err(|_| CfError::NotConnected)?;
        let seen = before.account.as_ref().map(|account| account.access_token.clone()).ok_or(CfError::NotConnected)?;
        if !force && let Some(token) = fresh(&before) {
            return Ok(token);
        }
        let _one_refresh = self.0.refreshing.lock().map_err(|_| CfError::NotConnected)?;
        let mut saved = self.snapshot().map_err(|_| CfError::NotConnected)?;
        // Refreshed by someone else while this waited: use theirs, never the spent refresh token.
        if let Some(account) = saved.account.as_ref()
            && account.access_token != seen
        {
            return Ok(account.access_token.clone());
        }
        let metadata = self.metadata(&saved).map_err(CfError::Unreachable)?;
        let Some(account) = saved.account.as_mut() else { return Err(CfError::NotConnected) };
        let tokens = oauth::refresh(&metadata, &saved.client_id, &account.refresh_token, unix_now()).map_err(|error| match error {
            oauth::OAuthError::Refused(_) => CfError::Unauthorized,
            other => CfError::Unreachable(other.to_string()),
        })?;
        account.access_token.clone_from(&tokens.access);
        account.refresh_token = tokens.refresh;
        account.expires_at = tokens.expires_at;
        if let Some(scope) = tokens.scope {
            account.scope = scope;
        }
        // Saved before it is used: the old refresh token no longer works.
        self.save(&saved).map_err(|error| CfError::Unreachable(error.to_string()))?;
        Ok(tokens.access)
    }
}

/// One save: create with the value, or on `409` a new version; then the description and metadata. A save with no
/// value only sets the metadata.
fn write_one(api: &Api, place: Place<'_>, key: &str, save: &Pending) -> Result<(), CfError> {
    if !save.value.is_empty() {
        let write = Write { key, value: &save.value, description: save.description.as_deref(), metadata: &save.metadata };
        match api.create(place, write) {
            Ok(()) => return Ok(()),
            Err(CfError::Conflict) => api.rotate(place, key, &save.value)?,
            Err(other) => return Err(other),
        }
    }
    api.settle(place, key, save.description.as_deref(), &save.metadata)
}
