//! The reveal code: an optional code the person sets in Settings, asked before a saved secret is shown again. Kept only
//! as an Argon2id hash in `security.json`. A right code opens reveals for a few minutes; repeated wrong codes make the
//! next try wait. It guards showing secrets, not using them: mail keeps arriving and alerts keep going without it.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use argon2::{Argon2, PasswordHasher, PasswordVerifier};
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::paths::write_private;

const FILE: &str = "security.json";

/// How long a right code keeps reveals open.
pub const UNLOCKED_FOR: Duration = Duration::from_mins(5);

/// How many wrong codes in a row before the next try must wait, and how long.
const TRIES: u32 = 5;
const WAIT: Duration = Duration::from_secs(60);

/// The shortest code accepted.
pub const SHORTEST: usize = 4;

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Saved {
    /// The code's Argon2id hash, in PHC form; none when no code is set.
    reveal_code: Option<String>,
}

#[derive(Default)]
struct State {
    hash: Option<String>,
    unlocked_until: Option<Instant>,
    wrong: u32,
    wait_until: Option<Instant>,
}

/// Whether a code is set and whether reveals are open now. Mirrors the UI's `RevealStatus`.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RevealStatusDto {
    /// A code is set.
    pub code_set: bool,
    /// Seconds reveals stay open without asking again; 0 when closed or no code is set.
    pub open_for: u64,
}

/// The reveal code and its open window.
pub struct RevealLock {
    config_folder: PathBuf,
    state: Mutex<State>,
}

fn hash(code: &str) -> Result<String, String> {
    let mut salt = [0_u8; 16];
    getrandom::fill(&mut salt).map_err(|error| error.to_string())?;
    Argon2::default().hash_password_with_salt(code.as_bytes(), &salt).map(|made| made.to_string()).map_err(|error| error.to_string())
}

impl RevealLock {
    /// Reads the saved code, if any.
    #[must_use]
    pub fn open(config_folder: &Path) -> Self {
        let saved: Saved = std::fs::read_to_string(config_folder.join(FILE)).ok().and_then(|text| serde_json::from_str(&text).ok()).unwrap_or_default();
        Self { config_folder: config_folder.to_path_buf(), state: Mutex::new(State { hash: saved.reveal_code, ..State::default() }) }
    }

    /// Whether a code is set, and how long reveals stay open.
    #[must_use]
    pub fn status(&self) -> RevealStatusDto {
        let Ok(state) = self.state.lock() else { return RevealStatusDto { code_set: true, open_for: 0 } };
        let open_for = state.unlocked_until.map_or(0, |until| until.saturating_duration_since(Instant::now()).as_secs());
        RevealStatusDto { code_set: state.hash.is_some(), open_for: if state.hash.is_some() { open_for } else { 0 } }
    }

    /// Lets a reveal through: at once when no code is set or reveals are open, otherwise when `code` is right, which
    /// opens reveals for [`UNLOCKED_FOR`].
    ///
    /// # Errors
    ///
    /// Why not, in words for the window: the code is needed, wrong, or tries must wait.
    pub fn check(&self, code: Option<&str>) -> Result<(), String> {
        let mut state = self.state.lock().map_err(|error| error.to_string())?;
        let Some(stored) = state.hash.clone() else { return Ok(()) };
        let now = Instant::now();
        if state.unlocked_until.is_some_and(|until| until > now) {
            return Ok(());
        }
        if let Some(until) = state.wait_until.filter(|until| *until > now) {
            return Err(format!("Too many wrong codes. Try again in {} seconds.", until.saturating_duration_since(now).as_secs().max(1)));
        }
        let Some(code) = code.filter(|code| !code.is_empty()) else { return Err("Enter your reveal code.".to_owned()) };
        if Argon2::default().verify_password(code.as_bytes(), stored.as_str()).is_ok() {
            state.wrong = 0;
            state.unlocked_until = Some(now + UNLOCKED_FOR);
            return Ok(());
        }
        state.wrong += 1;
        if state.wrong >= TRIES {
            state.wrong = 0;
            state.wait_until = Some(now + WAIT);
        }
        Err("That code is not right.".to_owned())
    }

    /// Sets, changes or removes the code: `new` of `None` removes it. Changing or removing a code needs the current one
    /// (or reveals open).
    ///
    /// # Errors
    ///
    /// When the current code is needed and wrong, the new one is too short, or the file cannot be written.
    pub fn set_code(&self, current: Option<&str>, new: Option<&str>) -> Result<RevealStatusDto, String> {
        self.check(current)?;
        let new = new.map(str::trim).filter(|code| !code.is_empty());
        if new.is_some_and(|code| code.chars().count() < SHORTEST) {
            return Err(format!("Use at least {SHORTEST} characters."));
        }
        let hashed = new.map(hash).transpose()?;
        self.save(hashed.clone()).map_err(|error| error.to_string())?;
        if let Ok(mut state) = self.state.lock() {
            state.hash = hashed;
            state.unlocked_until = None;
        }
        Ok(self.status())
    }

    /// Closes reveals now.
    pub fn lock(&self) {
        if let Ok(mut state) = self.state.lock() {
            state.unlocked_until = None;
        }
    }

    fn save(&self, hash: Option<String>) -> Result<(), AppError> {
        write_private(&self.config_folder.join(FILE), &serde_json::to_string_pretty(&Saved { reveal_code: hash }).unwrap_or_default())
    }
}
