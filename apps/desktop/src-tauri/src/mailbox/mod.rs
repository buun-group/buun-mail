//! The mailbox: the routing file, the rules and the local store, behind one lock each. The UI's commands and the
//! agent server both call it, so a change from either shows in the other.
//!
//! - `read`: workspaces, folders, messages, search, the activity log
//! - `change`: tags, moves, read state, stars, archive and trash
//! - `rules`: adding, editing, deleting and re-running rules
//! - `export`: writing messages out as `.eml`, `.mbox`, JSON, CSV or text
//! - `import`: taking in `.eml` and `.mbox` files
//! - `remote`: taking in one message from a source that knows its recipient, such as the mail gateway
//! - `sent`: the copy kept in Sent, the ids a reply threads under, recipients to suggest
//! - `routing`: reloading the routing file, and adding a workspace for a newly connected domain
//! - `provided`: workspaces an integration brings, such as dissolve.email's, beside the routing file's

mod change;
mod export;
mod import;
mod provided;
mod read;
mod remote;
mod routing;
mod rules;
mod sent;
#[cfg(test)]
mod tests;

use std::path::{Path, PathBuf};
use std::sync::{Mutex, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};

use buun_mail_routing::Router;
use buun_mail_rules::{CheckedRule, Rule};
use buun_mail_store::{Activity, Store};

pub use export::{AttachmentDataDto, ExportFormat};
pub use provided::ProvidedWorkspace;

use crate::error::AppError;
use crate::paths::AppPaths;

/// Who made a change, for the activity log.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Actor {
    /// The person at the keyboard.
    You,
    /// A rule, by name.
    Rule(String),
    /// An agent over MCP, by the name its client gave.
    Agent(String),
    /// The app on its own, such as emptying old mail from the trash.
    App,
}

impl Actor {
    fn label(&self) -> String {
        match self {
            Self::You => "you".to_owned(),
            Self::Rule(name) => format!("rule:{name}"),
            Self::Agent(name) => format!("agent:{name}"),
            Self::App => "app".to_owned(),
        }
    }
}

/// Every workspace, rule and message.
#[derive(Debug)]
pub struct Mailbox {
    router: RwLock<Router>,
    rules: RwLock<Vec<CheckedRule>>,
    store: Mutex<Store>,
    routing_path: PathBuf,
    provided: RwLock<Vec<ProvidedWorkspace>>,
    alerts: Mutex<Option<std::sync::mpsc::Sender<Alerted>>>,
}

/// A message that arrived and the alert channels its rules asked to tell.
#[derive(Debug, Clone)]
pub struct Alerted {
    /// The channels, by id.
    pub channels: Vec<String>,
    /// The message, as the list shows it.
    pub message: crate::dto::MessageDto,
}

impl Mailbox {
    /// Opens the mailbox from the app's folders, writing the example routing file on first run.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the routing file is invalid or the store cannot open.
    pub fn open(paths: &AppPaths) -> Result<Self, AppError> {
        Self::new(Router::from_toml(&paths.read_routing()?)?, Store::open(&paths.store)?, paths.routing.clone())
    }

    /// A mailbox from parts, its rules read from the store. Rules that no longer pass their check are skipped, not
    /// fatal: one bad rule must never stop mail arriving.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the store cannot be read.
    pub fn new(router: Router, store: Store, routing_path: PathBuf) -> Result<Self, AppError> {
        let rules = load_rules(&store)?;
        Ok(Self {
            router: RwLock::new(router),
            rules: RwLock::new(rules),
            store: Mutex::new(store),
            routing_path,
            provided: RwLock::default(),
            alerts: Mutex::default(),
        })
    }

    /// Where arriving mail's alerts go. Only arrivals alert; imports and re-run rules never do.
    pub fn on_alert(&self, sink: std::sync::mpsc::Sender<Alerted>) {
        if let Ok(mut alerts) = self.alerts.lock() {
            *alerts = Some(sink);
        }
    }

    /// Notes an alert sent, or why it was not, in the activity log.
    pub fn note_alert(&self, channel: &str, subject: &str, problem: Option<&str>) {
        if let Ok(store) = self.store.lock() {
            let detail = problem.map_or_else(|| format!("{channel}: \"{subject}\""), |problem| format!("{channel}: \"{subject}\" not sent: {problem}"));
            let _ = log(&store, &Actor::App, if problem.is_none() { "alert" } else { "alert_failed" }, detail);
        }
    }

    /// Hands a new message's alerts to the alert service, when a rule asked for any.
    pub(crate) fn alert(&self, channels: &[String], record: &buun_mail_store::MessageRecord) {
        if channels.is_empty() {
            return;
        }
        if let Ok(alerts) = self.alerts.lock()
            && let Some(sink) = alerts.as_ref()
        {
            let _ = sink.send(Alerted { channels: channels.to_vec(), message: crate::dto::MessageDto::from(record.clone()) });
        }
    }

    /// Runs `work` with the store held still and its log written into the index, so a copy taken meanwhile is whole.
    /// Mail waits for the store until it is done.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the store cannot be held or written.
    pub fn with_store_still<T>(&self, work: impl FnOnce() -> T) -> Result<T, AppError> {
        let store = self.store.lock()?;
        store.checkpoint()?;
        let result = work();
        drop(store);
        Ok(result)
    }

    /// Where the routing file lives, for the settings screen.
    #[must_use]
    pub fn routing_path(&self) -> &Path {
        &self.routing_path
    }
}

/// The store's rules, checked, in order. Unreadable ones are left out.
fn load_rules(store: &Store) -> Result<Vec<CheckedRule>, AppError> {
    Ok(store.rules()?.iter().filter_map(|stored| Rule::from_json(&stored.body).ok()?.check().ok()).collect())
}

/// Notes a change in the activity log.
fn log(store: &Store, actor: &Actor, action: &str, detail: String) -> Result<(), AppError> {
    Ok(store.log(&Activity { at: unix_now(), actor: actor.label(), action: action.to_owned(), detail })?)
}

/// Now, as RFC 3339 in UTC.
pub(crate) fn rfc3339_now() -> String {
    buun_mail_message::rfc3339(unix_now())
}

/// Now, in Unix seconds. A clock before 1970 counts as 1970.
pub(crate) fn unix_now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |elapsed| i64::try_from(elapsed.as_secs()).unwrap_or(i64::MAX))
}
