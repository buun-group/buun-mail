//! The alert channels and their delivery: arriving mail whose rules ask for an alert is handed to one worker thread,
//! which sends to each channel and notes how it went, so a slow service never holds up mail.

use std::collections::{BTreeMap, HashMap};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde::Serialize;

use super::deliver::{check, deliver};
use super::settings::{self, AlertChannel, AlertKind};
use crate::dto::MessageDto;
use crate::error::AppError;
use crate::mailbox::{Mailbox, rfc3339_now};
use crate::send::SendService;

/// One channel as Settings shows it: never its secret.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AlertChannelDto {
    /// Its id, which rules name.
    pub id: String,
    /// What the person calls it.
    pub name: String,
    /// Which kind.
    pub kind: AlertKind,
    /// The parts that are not secret.
    pub fields: BTreeMap<String, String>,
    /// True when a secret is saved for it.
    pub has_secret: bool,
    /// When it last sent, RFC 3339.
    pub last_sent: Option<String>,
    /// Alerts sent since the app started.
    pub sent: u32,
    /// What went wrong last, if anything.
    pub problem: Option<String>,
}

#[derive(Default, Clone)]
struct Progress {
    last_sent: Option<String>,
    sent: u32,
    problem: Option<String>,
}

struct Inner {
    config_folder: PathBuf,
    channels: Mutex<Vec<AlertChannel>>,
    progress: Mutex<HashMap<String, Progress>>,
    send: SendService,
    mailbox: Arc<Mailbox>,
}

/// The alert channels. Cheap to clone.
#[derive(Clone)]
pub struct AlertService(Arc<Inner>);

impl AlertService {
    /// Loads the channels and starts the worker that sends arriving mail's alerts.
    #[must_use]
    pub fn start(config_folder: PathBuf, mailbox: &Arc<Mailbox>, send: SendService) -> Self {
        let channels = Mutex::new(settings::load(&config_folder));
        let service = Self(Arc::new(Inner { config_folder, channels, progress: Mutex::default(), send, mailbox: Arc::clone(mailbox) }));
        let (sink, arrivals) = std::sync::mpsc::channel();
        mailbox.on_alert(sink);
        let working = service.clone();
        std::thread::spawn(move || {
            for alerted in arrivals {
                for id in &alerted.channels {
                    let _ = working.send_to(id, &alerted.message);
                }
            }
        });
        service
    }

    /// Every channel, never a secret.
    ///
    /// # Errors
    ///
    /// [`AppError::Poisoned`] after an earlier failure.
    pub fn list(&self) -> Result<Vec<AlertChannelDto>, AppError> {
        let channels = self.0.channels.lock()?;
        let progress = self.0.progress.lock()?;
        Ok(channels
            .iter()
            .map(|channel| {
                let seen = progress.get(&channel.id).cloned().unwrap_or_default();
                AlertChannelDto {
                    id: channel.id.clone(),
                    name: channel.name.clone(),
                    kind: channel.kind,
                    fields: channel.fields.clone(),
                    has_secret: !channel.secret.is_empty(),
                    last_sent: seen.last_sent,
                    sent: seen.sent,
                    problem: seen.problem,
                }
            })
            .collect())
    }

    /// Adds a channel after checking it has what it needs.
    ///
    /// # Errors
    ///
    /// What is missing, in words for the form, or a failure to save.
    pub fn add(&self, name: &str, kind: AlertKind, fields: BTreeMap<String, String>, secret: &str) -> Result<Vec<AlertChannelDto>, String> {
        let fields: BTreeMap<String, String> =
            fields.into_iter().map(|(key, value)| (key, value.trim().to_owned())).filter(|(_, value)| !value.is_empty()).collect();
        let mut channels = self.0.channels.lock().map_err(|error| error.to_string())?.clone();
        let mut number = channels.len() + 1;
        while channels.iter().any(|channel| channel.id == format!("alert-{number}")) {
            number += 1;
        }
        let channel = AlertChannel {
            id: format!("alert-{number}"),
            name: if name.trim().is_empty() { format!("Alert {number}") } else { name.trim().to_owned() },
            kind,
            fields,
            secret: secret.trim().to_owned(),
        };
        check(&channel)?;
        channels.push(channel);
        settings::save(&self.0.config_folder, &channels).map_err(|error| error.to_string())?;
        *self.0.channels.lock().map_err(|error| error.to_string())? = channels;
        self.list().map_err(|error| error.to_string())
    }

    /// Forgets a channel. Rules that named it stop alerting there.
    ///
    /// # Errors
    ///
    /// A failure to save.
    pub fn remove(&self, id: &str) -> Result<Vec<AlertChannelDto>, AppError> {
        let mut channels = self.0.channels.lock()?.clone();
        channels.retain(|channel| channel.id != id);
        settings::save(&self.0.config_folder, &channels)?;
        *self.0.channels.lock()? = channels;
        self.list()
    }

    /// A channel's secret, for showing it again once the reveal code allows.
    #[must_use]
    pub fn secret(&self, id: &str) -> Option<String> {
        self.0.channels.lock().ok()?.iter().find(|channel| channel.id == id).map(|channel| channel.secret.clone())
    }

    /// Sends a sample alert through a channel, so the person sees it work.
    ///
    /// # Errors
    ///
    /// What went wrong, in words for a toast.
    pub fn test(&self, id: &str) -> Result<(), String> {
        let sample = MessageDto::sample_for_alert();
        self.send_to(id, &sample)
    }

    /// Sends one alert and notes how it went, in Settings and the activity log.
    fn send_to(&self, id: &str, message: &MessageDto) -> Result<(), String> {
        let channel = self.0.channels.lock().map_err(|error| error.to_string())?.iter().find(|channel| channel.id == id).cloned();
        let Some(channel) = channel else { return Err("That alert channel was removed.".to_owned()) };
        let outcome = deliver(&channel, message, &self.0.send);
        if let Ok(mut progress) = self.0.progress.lock() {
            let entry = progress.entry(channel.id.clone()).or_default();
            match &outcome {
                Ok(()) => {
                    entry.last_sent = Some(rfc3339_now());
                    entry.sent += 1;
                    entry.problem = None;
                }
                Err(problem) => entry.problem = Some(problem.clone()),
            }
        }
        self.0.mailbox.note_alert(&channel.name, &message.subject, outcome.as_ref().err().map(String::as_str));
        outcome
    }
}
