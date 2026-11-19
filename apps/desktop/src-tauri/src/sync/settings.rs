//! The gateways this app collects from, saved as `gateways.json` in the config folder, readable by this user only. A
//! single gateway saved by an older version (`gateway.json`) is carried over on first read.

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::paths::file_error;

/// The settings file's name in the config folder.
const FILE: &str = "gateways.json";

/// The file one gateway was kept in before there could be several.
const OLD_FILE: &str = "gateway.json";

/// One gateway: where it is, what the person calls it, and the token that opens their mailbox there.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GatewaySettings {
    /// A stable id, made when the gateway is added.
    pub id: String,
    /// What the person calls it, such as `Buun Group` or `Flung`.
    pub name: String,
    /// The gateway's address, such as `https://mail-gateway.buungroup.com`.
    pub url: String,
    /// The mailbox token, `bmg_...`.
    pub token: String,
}

#[derive(Deserialize)]
struct OldSettings {
    url: String,
    token: String,
}

/// Every saved gateway, oldest first.
#[must_use]
pub fn load(config_folder: &Path) -> Vec<GatewaySettings> {
    if let Some(list) = fs::read_to_string(config_folder.join(FILE)).ok().and_then(|text| serde_json::from_str(&text).ok()) {
        return list;
    }
    let old = fs::read_to_string(config_folder.join(OLD_FILE)).ok().and_then(|text| serde_json::from_str::<OldSettings>(&text).ok());
    old.map(|old| vec![GatewaySettings { id: "gateway-1".to_owned(), name: "Mail gateway".to_owned(), url: old.url, token: old.token }]).unwrap_or_default()
}

/// Saves every gateway so only this user can read them, and drops the old single-gateway file.
///
/// # Errors
///
/// [`AppError::File`] when the file cannot be written.
pub fn save(config_folder: &Path, gateways: &[GatewaySettings]) -> Result<(), AppError> {
    let path = config_folder.join(FILE);
    fs::create_dir_all(config_folder).map_err(|source| file_error(config_folder, source))?;
    // Settings are plain strings, so serialising cannot fail.
    fs::write(&path, serde_json::to_string_pretty(gateways).unwrap_or_default()).map_err(|source| file_error(&path, source))?;
    restrict(&path).map_err(|source| file_error(&path, source))?;
    let _ = fs::remove_file(config_folder.join(OLD_FILE));
    Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn carries_over_a_single_saved_gateway_then_keeps_a_list() -> Result<(), AppError> {
        let folder = tempfile::tempdir().map_err(|source| file_error(Path::new("temp"), source))?;
        fs::write(folder.path().join(OLD_FILE), r#"{"url":"https://gw.example","token":"bmg_old"}"#).map_err(|source| file_error(folder.path(), source))?;
        let carried = load(folder.path());
        assert_eq!(carried.len(), 1);
        assert_eq!(carried.first().map(|gateway| gateway.token.as_str()), Some("bmg_old"));

        let mut both = carried;
        both.push(GatewaySettings {
            id: "gateway-2".to_owned(),
            name: "Flung".to_owned(),
            url: "https://flung.example".to_owned(),
            token: "bmg_new".to_owned(),
        });
        save(folder.path(), &both)?;
        assert_eq!(load(folder.path()), both);
        assert!(!folder.path().join(OLD_FILE).exists(), "the old single-gateway file is dropped once a list is saved");
        Ok(())
    }
}
