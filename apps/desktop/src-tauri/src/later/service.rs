//! The schedule and the reminders, and the loop that sends what is due and tells you about unanswered mail.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use buun_mail_message::rfc3339;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter as _};

use crate::error::AppError;
use crate::mailbox::{Mailbox, unix_now};
use crate::paths::write_private;
use crate::send::{DraftDto, SendService};

const FILE: &str = "later.json";

/// How often the schedule is checked.
const INTERVAL: Duration = Duration::from_secs(30);

/// The event a due reminder raises.
pub const REMINDER_DUE: &str = "reminder-due";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Scheduled {
    id: String,
    draft: DraftDto,
    send_at: i64,
    /// Why the last try failed, kept so the person sees it.
    #[serde(default)]
    problem: Option<String>,
    /// After it is sent, remind if nobody answers within this many days.
    #[serde(default)]
    remind_days: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Reminder {
    id: String,
    /// The sent message to follow up on.
    message_id: String,
    subject: String,
    to: String,
    /// When it was sent, Unix seconds: a reply is anything in its conversation, from someone else, after this.
    sent_at: i64,
    due_at: i64,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Saved {
    scheduled: Vec<Scheduled>,
    reminders: Vec<Reminder>,
    next: u64,
}

/// A scheduled message as the window shows it.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledDto {
    /// Its id.
    pub id: String,
    /// Who it is from.
    pub from: String,
    /// Who it goes to.
    pub to: Vec<String>,
    /// Its subject.
    pub subject: String,
    /// When it goes, RFC 3339.
    pub send_at: String,
    /// Why the last try failed, if it did.
    pub problem: Option<String>,
}

/// A reminder as the window shows it, and as the due event carries it.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReminderDto {
    /// Its id.
    pub id: String,
    /// The sent message.
    pub message_id: String,
    /// Its subject.
    pub subject: String,
    /// Who it went to.
    pub to: String,
    /// When it is due, RFC 3339.
    pub due_at: String,
}

struct Inner {
    config_folder: PathBuf,
    saved: Mutex<Saved>,
    send: SendService,
    mailbox: Arc<Mailbox>,
    app: Option<AppHandle>,
}

/// Scheduled sends and follow-up reminders. Cheap to clone.
#[derive(Clone)]
pub struct LaterService(Arc<Inner>);

impl LaterService {
    /// Loads the schedule and checks it every half minute.
    #[must_use]
    pub fn start(config_folder: PathBuf, mailbox: &Arc<Mailbox>, send: SendService, app: Option<AppHandle>) -> Self {
        let service = Self::new(config_folder, mailbox, send, app);
        let looping = service.clone();
        std::thread::spawn(move || {
            loop {
                looping.run_due(unix_now());
                std::thread::sleep(INTERVAL);
            }
        });
        service
    }

    /// The service without its loop.
    pub(super) fn new(config_folder: PathBuf, mailbox: &Arc<Mailbox>, send: SendService, app: Option<AppHandle>) -> Self {
        let saved = std::fs::read_to_string(config_folder.join(FILE)).ok().and_then(|text| serde_json::from_str(&text).ok()).unwrap_or_default();
        Self(Arc::new(Inner { config_folder, saved: Mutex::new(saved), send, mailbox: Arc::clone(mailbox), app }))
    }

    fn save(&self, saved: &Saved) -> Result<(), AppError> {
        write_private(&self.0.config_folder.join(FILE), &serde_json::to_string_pretty(saved).unwrap_or_default())
    }

    fn change<T>(&self, edit: impl FnOnce(&mut Saved) -> T) -> Result<T, String> {
        let mut saved = self.0.saved.lock().map_err(|error| error.to_string())?;
        let result = edit(&mut saved);
        self.save(&saved).map_err(|error| error.to_string())?;
        Ok(result)
    }

    /// Schedules a message to go at `send_at` (Unix seconds), and a reminder after it when `remind_days` is given.
    ///
    /// # Errors
    ///
    /// When the time has passed, or the schedule cannot be saved.
    pub fn schedule(&self, draft: DraftDto, send_at: i64, remind_days: Option<u32>) -> Result<Vec<ScheduledDto>, String> {
        if send_at <= unix_now() {
            return Err("Pick a time that has not passed yet.".to_owned());
        }
        if draft.to.is_empty() && draft.cc.is_empty() && draft.bcc.is_empty() {
            return Err("Add at least one recipient.".to_owned());
        }
        self.change(|saved| {
            saved.next += 1;
            saved.scheduled.push(Scheduled { id: format!("later-{}", saved.next), draft, send_at, problem: None, remind_days });
        })?;
        self.scheduled()
    }

    /// Every scheduled message, soonest first.
    ///
    /// # Errors
    ///
    /// [`AppError::Poisoned`] after an earlier failure, in words.
    pub fn scheduled(&self) -> Result<Vec<ScheduledDto>, String> {
        let saved = self.0.saved.lock().map_err(|error| error.to_string())?;
        let mut list: Vec<ScheduledDto> = saved
            .scheduled
            .iter()
            .map(|item| ScheduledDto {
                id: item.id.clone(),
                from: item.draft.from.address.clone(),
                to: item.draft.to.iter().map(|person| person.address.clone()).collect(),
                subject: item.draft.subject.clone(),
                send_at: rfc3339(item.send_at),
                problem: item.problem.clone(),
            })
            .collect();
        list.sort_by(|a, b| a.send_at.cmp(&b.send_at));
        Ok(list)
    }

    /// Cancels a scheduled message.
    ///
    /// # Errors
    ///
    /// When the schedule cannot be saved.
    pub fn cancel(&self, id: &str) -> Result<Vec<ScheduledDto>, String> {
        self.change(|saved| saved.scheduled.retain(|item| item.id != id))?;
        self.scheduled()
    }

    /// Sends a scheduled message now.
    ///
    /// # Errors
    ///
    /// Why it could not be sent, in words.
    pub fn send_now(&self, id: &str) -> Result<Vec<ScheduledDto>, String> {
        let item = self.0.saved.lock().map_err(|error| error.to_string())?.scheduled.iter().find(|item| item.id == id).cloned();
        let Some(item) = item else { return Err("That message is no longer scheduled.".to_owned()) };
        self.deliver(&item, unix_now())?;
        self.scheduled()
    }

    /// Reminds you in `days` days if nobody answers the sent message `message_id`.
    ///
    /// # Errors
    ///
    /// For an unknown message, or when it cannot be saved.
    pub fn remind(&self, message_id: &str, days: u32) -> Result<Vec<ReminderDto>, String> {
        let message = self.0.mailbox.message(message_id).map_err(|error| error.to_string())?;
        let now = unix_now();
        self.change(|saved| {
            saved.next += 1;
            saved.reminders.retain(|reminder| reminder.message_id != message_id);
            saved.reminders.push(Reminder {
                id: format!("remind-{}", saved.next),
                message_id: message_id.to_owned(),
                subject: message.subject.clone(),
                to: message.to.clone(),
                sent_at: now,
                due_at: now + i64::from(days.max(1)) * 86_400,
            });
        })?;
        self.reminders()
    }

    /// Every waiting reminder, soonest first.
    ///
    /// # Errors
    ///
    /// [`AppError::Poisoned`] after an earlier failure, in words.
    pub fn reminders(&self) -> Result<Vec<ReminderDto>, String> {
        let saved = self.0.saved.lock().map_err(|error| error.to_string())?;
        let mut list: Vec<ReminderDto> = saved.reminders.iter().map(reminder_dto).collect();
        list.sort_by(|a, b| a.due_at.cmp(&b.due_at));
        Ok(list)
    }

    /// Drops a reminder.
    ///
    /// # Errors
    ///
    /// When it cannot be saved.
    pub fn cancel_reminder(&self, id: &str) -> Result<Vec<ReminderDto>, String> {
        self.change(|saved| saved.reminders.retain(|reminder| reminder.id != id))?;
        self.reminders()
    }

    /// Sends one scheduled message, then drops it from the schedule and sets its reminder; on a failure keeps it,
    /// noting why, to try again on the next check.
    fn deliver(&self, item: &Scheduled, now: i64) -> Result<(), String> {
        match self.0.send.send(&item.draft) {
            Ok(sent) => {
                self.change(|saved| {
                    saved.scheduled.retain(|kept| kept.id != item.id);
                    if let Some(days) = item.remind_days {
                        saved.next += 1;
                        saved.reminders.push(Reminder {
                            id: format!("remind-{}", saved.next),
                            message_id: sent.id.clone(),
                            subject: sent.subject.clone(),
                            to: sent.to.clone(),
                            sent_at: now,
                            due_at: now + i64::from(days.max(1)) * 86_400,
                        });
                    }
                })?;
                if let Some(app) = &self.0.app {
                    crate::events::mail_changed(app);
                }
                Ok(())
            }
            Err(failure) => {
                let message = failure.message;
                let _ = self.change(|saved| {
                    if let Some(kept) = saved.scheduled.iter_mut().find(|kept| kept.id == item.id) {
                        kept.problem = Some(message.clone());
                    }
                });
                Err(message)
            }
        }
    }

    /// Sends what is due and raises reminders that are due and unanswered; answered ones go quietly.
    pub(super) fn run_due(&self, now: i64) {
        let (due, reminders) = {
            let Ok(saved) = self.0.saved.lock() else { return };
            (
                saved.scheduled.iter().filter(|item| item.send_at <= now).cloned().collect::<Vec<_>>(),
                saved.reminders.iter().filter(|reminder| reminder.due_at <= now).cloned().collect::<Vec<_>>(),
            )
        };
        for item in &due {
            let _ = self.deliver(item, now);
        }
        for reminder in reminders {
            let answered = self.0.mailbox.answered_since(&reminder.message_id, reminder.sent_at).unwrap_or(false);
            let _ = self.change(|saved| saved.reminders.retain(|kept| kept.id != reminder.id));
            if !answered && let Some(app) = &self.0.app {
                let _ = app.emit(REMINDER_DUE, reminder_dto(&reminder));
            }
            if !answered {
                self.0.mailbox.note_reminder(&reminder.subject, &reminder.to);
            }
        }
    }
}

fn reminder_dto(reminder: &Reminder) -> ReminderDto {
    ReminderDto {
        id: reminder.id.clone(),
        message_id: reminder.message_id.clone(),
        subject: reminder.subject.clone(),
        to: reminder.to.clone(),
        due_at: rfc3339(reminder.due_at),
    }
}
