//! Agent settings: on or off, the port and the token. Saved as `agent.json` beside the routing file.

use std::fmt::Write;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::paths::file_error;

/// The settings file's name in the config folder.
const FILE: &str = "agent.json";

/// The port agents connect to unless changed. Beside the app's own 286xx ports.
pub const DEFAULT_PORT: u16 = 28_700;

/// How many random bytes make a token. 32 bytes is 256 bits, written as 64 hex characters.
const TOKEN_BYTES: usize = 32;

/// What the agent server runs with.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSettings {
    /// Whether the server runs. Off until the person turns it on.
    pub enabled: bool,
    /// The local port.
    pub port: u16,
    /// The bearer token every request must carry.
    pub token: String,
}

impl AgentSettings {
    /// Reads the settings, or makes new ones (off, with a fresh token) when there are none yet.
    ///
    /// # Errors
    ///
    /// [`AppError::File`] when the file exists but cannot be read, or a new one cannot be written.
    pub fn load(config_folder: &Path) -> Result<Self, AppError> {
        let path = config_folder.join(FILE);
        match fs::read_to_string(&path) {
            Ok(text) => Ok(serde_json::from_str(&text).unwrap_or_else(|_| Self::fresh())),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                let fresh = Self::fresh();
                fresh.save(config_folder)?;
                Ok(fresh)
            }
            Err(source) => Err(file_error(&path, source)),
        }
    }

    /// Writes the settings.
    ///
    /// # Errors
    ///
    /// [`AppError::File`] when the file cannot be written.
    pub fn save(&self, config_folder: &Path) -> Result<(), AppError> {
        let path: PathBuf = config_folder.join(FILE);
        fs::create_dir_all(config_folder).map_err(|source| file_error(config_folder, source))?;
        // Settings are plain strings, numbers and booleans, so serialising cannot fail.
        fs::write(&path, serde_json::to_string_pretty(self).unwrap_or_default()).map_err(|source| file_error(&path, source))
    }

    /// Off, on the default port, with a new token.
    #[must_use]
    pub fn fresh() -> Self {
        Self { enabled: false, port: DEFAULT_PORT, token: new_token() }
    }

    /// The URL agents connect to.
    #[must_use]
    pub fn url(&self) -> String {
        format!("http://127.0.0.1:{}/mcp", self.port)
    }
}

/// A new random token as lowercase hex. Falls back to the clock only if the system has no randomness at all, which
/// no supported platform lacks.
#[must_use]
pub fn new_token() -> String {
    let mut bytes = [0_u8; TOKEN_BYTES];
    if getrandom::fill(&mut bytes).is_err() {
        let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |elapsed| elapsed.as_nanos());
        bytes.iter_mut().zip(nanos.to_le_bytes().iter().cycle()).for_each(|(byte, source)| *byte = *source);
    }
    bytes.iter().fold(String::with_capacity(TOKEN_BYTES * 2), |mut hex, byte| {
        // Writing to a String never fails.
        let _ = write!(hex, "{byte:02x}");
        hex
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn makes_new_settings_off_with_a_long_token() -> Result<(), AppError> {
        let folder = tempfile::tempdir().map_err(|source| file_error(Path::new("temp"), source))?;
        let settings = AgentSettings::load(folder.path())?;
        assert!(!settings.enabled);
        assert_eq!(settings.token.len(), TOKEN_BYTES * 2);
        assert_eq!(AgentSettings::load(folder.path())?, settings, "the second load reads what the first wrote");
        assert_ne!(new_token(), new_token());
        Ok(())
    }
}
