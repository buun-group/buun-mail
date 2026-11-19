//! What the app keeps about agent access: the settings, where they are saved, and the server.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::AppHandle;

use super::server::AgentServer;
use super::settings::{AgentSettings, new_token};
use crate::error::AppError;
use crate::mailbox::Mailbox;

/// Agent access, as the Settings screen sees it.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatusDto {
    /// Whether the person turned it on.
    pub enabled: bool,
    /// Whether the server is listening now.
    pub running: bool,
    /// The URL to give an agent.
    pub url: String,
    /// The bearer token.
    pub token: String,
    /// Why it is not running, when it should be.
    pub problem: Option<String>,
}

/// The settings and the server, behind one lock.
pub struct AgentState {
    settings: Mutex<AgentSettings>,
    problem: Mutex<Option<String>>,
    config_folder: PathBuf,
    server: AgentServer,
}

impl AgentState {
    /// Loads the settings and starts the server when they say so. A port that is taken is reported, not fatal.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the settings cannot be read or written.
    pub fn open(config_folder: PathBuf, mailbox: Arc<Mailbox>, app: Option<AppHandle>) -> Result<Self, AppError> {
        let settings = AgentSettings::load(&config_folder)?;
        let state = Self { settings: Mutex::new(settings.clone()), problem: Mutex::new(None), config_folder, server: AgentServer::new(mailbox, app) };
        if settings.enabled {
            state.run(&settings)?;
        }
        Ok(state)
    }

    /// The current status.
    ///
    /// # Errors
    ///
    /// [`AppError::Poisoned`] after an earlier failure.
    pub fn status(&self) -> Result<AgentStatusDto, AppError> {
        let settings = self.settings.lock()?;
        Ok(AgentStatusDto {
            enabled: settings.enabled,
            running: self.server.is_running(),
            url: settings.url(),
            token: settings.token.clone(),
            problem: self.problem.lock()?.clone(),
        })
    }

    /// Turns agent access on or off, saves it and starts or stops the server.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the settings cannot be saved.
    pub fn set_enabled(&self, enabled: bool) -> Result<AgentStatusDto, AppError> {
        let settings = self.update(|settings| settings.enabled = enabled)?;
        if enabled {
            self.run(&settings)?;
        } else {
            self.server.stop();
            *self.problem.lock()? = None;
        }
        self.status()
    }

    /// Makes a new token, so every agent connected with the old one is cut off. Restarts the server if it runs.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the settings cannot be saved.
    pub fn regenerate_token(&self) -> Result<AgentStatusDto, AppError> {
        let settings = self.update(|settings| settings.token = new_token())?;
        if settings.enabled {
            self.run(&settings)?;
        }
        self.status()
    }

    fn update(&self, change: impl FnOnce(&mut AgentSettings)) -> Result<AgentSettings, AppError> {
        let mut settings = self.settings.lock()?;
        change(&mut settings);
        settings.save(&self.config_folder)?;
        Ok(settings.clone())
    }

    fn run(&self, settings: &AgentSettings) -> Result<(), AppError> {
        *self.problem.lock()? = self.server.start(settings).err();
        Ok(())
    }
}
