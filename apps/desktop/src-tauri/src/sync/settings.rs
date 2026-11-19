//! The gateway's address and token, saved as `gateway.json` in the config folder, readable by this user only.

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::paths::file_error;

/// The settings file's name in the config folder.
const FILE: &str = "gateway.json";

/// Where the gateway is and the token that opens this mailbox.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GatewaySettings {
    /// The gateway's address, such as `https://mail-gateway.buungroup.com`.
    pub url: String,
    /// The mailbox token, `bmg_...`.
    pub token: String,
}

impl GatewaySettings {
    /// The saved settings, or none when the gateway is not connected.
    #[must_use]
    pub fn load(config_folder: &Path) -> Option<Self> {
        serde_json::from_str(&fs::read_to_string(config_folder.join(FILE)).ok()?).ok()
    }

    /// Saves the settings so only this user can read them.
    ///
    /// # Errors
    ///
    /// [`AppError::File`] when the file cannot be written.
    pub fn save(&self, config_folder: &Path) -> Result<(), AppError> {
        let path = config_folder.join(FILE);
        fs::create_dir_all(config_folder).map_err(|source| file_error(config_folder, source))?;
        // Settings are two strings, so serialising cannot fail.
        fs::write(&path, serde_json::to_string_pretty(self).unwrap_or_default()).map_err(|source| file_error(&path, source))?;
        restrict(&path).map_err(|source| file_error(&path, source))
    }

    /// Forgets the settings.
    ///
    /// # Errors
    ///
    /// [`AppError::File`] when the file exists but cannot be removed.
    pub fn forget(config_folder: &Path) -> Result<(), AppError> {
        let path = config_folder.join(FILE);
        match fs::remove_file(&path) {
            Err(error) if error.kind() != std::io::ErrorKind::NotFound => Err(file_error(&path, error)),
            _ => Ok(()),
        }
    }
}

/// Owner read and write only, where the platform has such permissions.
#[cfg(unix)]
fn restrict(path: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))
}

#[cfg(not(unix))]
fn restrict(_path: &Path) -> std::io::Result<()> {
    Ok(())
}
