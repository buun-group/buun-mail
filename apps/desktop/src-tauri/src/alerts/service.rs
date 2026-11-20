//! The alert channels and their delivery: arriving mail whose rules ask for an alert is handed to one worker thread,
//! which sends to each channel and notes how it went, so a slow service never holds up mail.

use std::collections::{BTreeMap, HashMap};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde::Serialize;

use super::deliver::{check, deliver, deliver_text};
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
    /// Minutes the person's clock is ahead of UTC, as the window last said; digests go by local time.
    local_offset: Mutex<i64>,
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
        let service =
            Self(Arc::new(Inner { local_offset: Mutex::new(0), config_folder, channels, progress: Mutex::default(), send, mailbox: Arc::clone(mailbox) }));
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
        let digesting = service.clone();
        std::thread::spawn(move || {
            loop {
                digesting.digests_due(crate::mailbox::unix_now());
                std::thread::sleep(std::time::Duration::from_secs(60));
            }
        });
        service
    }

    /// Notes how far the person's clock is from UTC, in minutes ahead, so digests go at their local time.
    pub fn set_local_offset(&self, minutes: i64) {
        if let Ok(mut offset) = self.0.local_offset.lock() {
            *offset = minutes.clamp(-14 * 60, 14 * 60);
        }
    }

    /// Sends each channel's daily digest when its local time has come and it has not gone today.
    pub(super) fn digests_due(&self, now: i64) {
        let offset = self.0.local_offset.lock().map_or(0, |offset| *offset);
        let local = now + offset * 60;
        let day = buun_mail_message::rfc3339(local).get(..10).unwrap_or_default().to_owned();
        let minute_of_day = local.rem_euclid(86_400) / 60;
        let due: Vec<String> = self
            .0
            .channels
            .lock()
            .map(|channels| {
                channels
                    .iter()
                    .filter(|channel| {
                        digest_minute(channel.field("digestAt")).is_some_and(|at| minute_of_day >= at) && channel.last_digest.as_deref() != Some(day.as_str())
                    })
                    .map(|channel| channel.id.clone())
                    .collect()
            })
            .unwrap_or_default();
        for id in due {
            let _ = self.send_digest(&id, now);
            let _ = self.mark_digest(&id, &day);
        }
    }

    fn mark_digest(&self, id: &str, day: &str) -> Result<(), String> {
        let mut channels = self.0.channels.lock().map_err(|error| error.to_string())?.clone();
        if let Some(channel) = channels.iter_mut().find(|channel| channel.id == id) {
            channel.last_digest = Some(day.to_owned());
        }
        settings::save(&self.0.config_folder, &channels).map_err(|error| error.to_string())?;
        *self.0.channels.lock().map_err(|error| error.to_string())? = channels;
        Ok(())
    }

    /// Sends a channel's digest of the last day now.
    ///
    /// # Errors
    ///
    /// What went wrong, in words for a toast.
    pub fn send_digest(&self, id: &str, now: i64) -> Result<(), String> {
        let channel = self.0.channels.lock().map_err(|error| error.to_string())?.iter().find(|channel| channel.id == id).cloned();
        let Some(channel) = channel else { return Err("That alert channel was removed.".to_owned()) };
        let lines = self.0.mailbox.digest(now - 86_400).map_err(|error| error.to_string())?;
        let total: usize = lines.iter().map(|line| line.count).sum();
        let title = if total == 0 { "Daily digest: no new mail".to_owned() } else { format!("Daily digest: {total} new") };
        let body = if lines.is_empty() {
            "Nothing arrived in the last day.".to_owned()
        } else {
            lines
                .iter()
                .map(|line| {
                    let subjects = line.subjects.iter().map(|subject| format!("  {subject}")).collect::<Vec<_>>().join("\n");
                    format!("{}: {} new, {} unread\n{subjects}", line.workspace, line.count, line.unread)
                })
                .collect::<Vec<_>>()
                .join("\n\n")
        };
        let payload = serde_json::json!({ "event": "digest", "title": title, "text": body, "workspaces": lines.iter().map(|line| serde_json::json!({ "workspace": line.workspace, "count": line.count, "unread": line.unread, "subjects": line.subjects })).collect::<Vec<_>>() });
        let outcome = deliver_text(&channel, &title, &body, &payload, &self.0.send);
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
        self.0.mailbox.note_alert(&channel.name, &title, outcome.as_ref().err().map(String::as_str));
        outcome
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
            last_digest: None,
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

/// A digest time, `08:00`, as minutes after midnight; `None` when there is none or it does not read.
fn digest_minute(at: &str) -> Option<i64> {
    let (hours, minutes) = at.trim().split_once(':')?;
    let (hours, minutes) = (hours.parse::<i64>().ok()?, minutes.parse::<i64>().ok()?);
    ((0..24).contains(&hours) && (0..60).contains(&minutes)).then_some(hours * 60 + minutes)
}
