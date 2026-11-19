//! Where Buun Mail keeps its files: the routing file in the config folder, the store in the data folder. Both are the
//! platform's own (`~/.config/buun-mail` and `~/.local/share/buun-mail` on Linux, `~/Library/Application Support` on
//! macOS, `%APPDATA%` on Windows), resolved by Tauri from the app identifier.

use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use crate::error::AppError;

/// The routing file's name in the config folder.
const ROUTING_FILE: &str = "workspaces.toml";

/// The store's folder name in the data folder.
const STORE_DIR: &str = "store";

/// The routing file a first run starts from: the commented example, so the format explains itself.
pub const EXAMPLE_ROUTING: &str = include_str!("../../../../config/workspaces.example.toml");

/// The two places the app reads and writes.
#[derive(Debug, Clone)]
pub struct AppPaths {
    /// The routing file.
    pub routing: PathBuf,
    /// The store folder.
    pub store: PathBuf,
}

impl AppPaths {
    /// Resolves both places for this platform.
    ///
    /// # Errors
    ///
    /// [`AppError::File`] when the platform gives no config or data folder.
    pub fn resolve(app: &AppHandle) -> Result<Self, AppError> {
        let resolver = app.path();
        let config = resolver.app_config_dir().map_err(|error| missing("config folder", &error))?;
        let data = resolver.app_data_dir().map_err(|error| missing("data folder", &error))?;
        Ok(Self { routing: config.join(ROUTING_FILE), store: data.join(STORE_DIR) })
    }

    /// Reads the routing file, writing the example first when there is none yet.
    ///
    /// # Errors
    ///
    /// [`AppError::File`] when the file cannot be read or written.
    pub fn read_routing(&self) -> Result<String, AppError> {
        if !self.routing.exists() {
            write(&self.routing, EXAMPLE_ROUTING)?;
        }
        fs::read_to_string(&self.routing).map_err(|source| file_error(&self.routing, source))
    }
}

/// Writes a file, creating its folder.
fn write(path: &Path, contents: &str) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|source| file_error(parent, source))?;
    }
    fs::write(path, contents).map_err(|source| file_error(path, source))
}

pub(crate) fn file_error(path: &Path, source: std::io::Error) -> AppError {
    AppError::File { path: path.display().to_string(), source }
}

fn missing(what: &str, error: &tauri::Error) -> AppError {
    AppError::File { path: what.to_owned(), source: std::io::Error::other(error.to_string()) }
}
