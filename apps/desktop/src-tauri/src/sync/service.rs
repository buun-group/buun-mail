//! The sync loop, event-driven: it collects when a gateway's WebSocket says mail arrived or (re)connects, when the app
//! starts, and on Check now. A timer runs only as a safety net: hourly while every socket is up, every five minutes while
//! one is down (a network that blocks `WebSocket` connections still gets its mail).

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::AppHandle;

use super::collect::collect;
use super::gateway::{AvailableZone, DomainRoute, GatewayClient, OwnedDomain};
use super::push::{self, Heartbeat, Listener};
use super::settings::{self, GatewaySettings};
use crate::error::AppError;
use crate::events;
use crate::mailbox::{Mailbox, unix_now};

/// How often the safety check runs while every gateway's socket is up: notes can be lost, so mail never waits longer.
const SAFETY_EVERY: Duration = Duration::from_hours(1);

/// How often it runs while a socket is down, so a network that blocks `WebSocket` connections still gets mail.
const DOWN_EVERY: Duration = Duration::from_mins(5);

/// How often the listener thread looks for gateways added or removed. Local only, no request.
const LISTENER_SCAN: Duration = Duration::from_secs(30);

/// One gateway, as Settings shows it.
#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GatewayStatusDto {
    /// The gateway's id in this app.
    pub id: String,
    /// What the person calls it.
    pub name: String,
    /// Its address.
    pub url: String,
    /// When it last checked, RFC 3339.
    pub last_checked: Option<String>,
    /// Messages taken in from it since the app started.
    pub received: u32,
    /// What went wrong on its last check, if anything.
    pub problem: Option<String>,
}

/// What a check of every gateway, asked for now, found: how many messages arrived, and each gateway after it.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CheckReportDto {
    /// Messages taken in by this check, across every gateway.
    pub arrived: usize,
    /// Every gateway, as Settings shows it, after the check.
    pub gateways: Vec<GatewayStatusDto>,
}

/// What one check of one gateway found.
#[derive(Debug, Clone, Default)]
struct Progress {
    last_checked: Option<String>,
    received: u32,
    problem: Option<String>,
}

/// The shared state between the commands and the loop.
struct Shared {
    gateways: Mutex<Vec<GatewaySettings>>,
    progress: Mutex<HashMap<String, Progress>>,
    wake: Condvar,
    woken: Mutex<bool>,
    /// Held for the length of a check, so the loop and a check asked for now never collect at once.
    checking: Mutex<()>,
    /// The gateways whose WebSocket is up now.
    connected: Mutex<HashSet<String>>,
    /// The gateways too old for the collect call, which use list, fetch and acknowledge instead.
    legacy: Mutex<HashSet<String>>,
    mailbox: Arc<Mailbox>,
    app: Option<AppHandle>,
}

/// A check that can run away from the window's thread, for Check now.
pub struct CheckNow(Arc<Shared>);

impl CheckNow {
    /// Checks every gateway now and reports what arrived.
    ///
    /// # Errors
    ///
    /// [`AppError::Poisoned`] after an earlier failure.
    pub fn run(&self) -> Result<CheckReportDto, AppError> {
        let arrived = check_all(&self.0);
        Ok(CheckReportDto { arrived, gateways: statuses(&self.0)? })
    }
}

/// The sync service: owns the loop thread and the saved gateways.
pub struct SyncService {
    shared: Arc<Shared>,
    config_folder: PathBuf,
}

impl SyncService {
    /// A gateway's mailbox token, for showing it again once the reveal code allows.
    #[must_use]
    pub fn secret(&self, id: &str) -> Option<String> {
        self.shared.gateways.lock().ok()?.iter().find(|gateway| gateway.id == id).map(|gateway| gateway.token.clone())
    }

    /// Loads the saved gateways and starts the loop. `app` lets it announce new mail; tests pass none.
    #[must_use]
    pub fn start(config_folder: PathBuf, mailbox: Arc<Mailbox>, app: Option<AppHandle>) -> Self {
        let shared = Arc::new(Shared {
            gateways: Mutex::new(settings::load(&config_folder)),
            progress: Mutex::new(HashMap::new()),
            wake: Condvar::new(),
            woken: Mutex::new(true),
            checking: Mutex::new(()),
            connected: Mutex::new(HashSet::new()),
            legacy: Mutex::new(HashSet::new()),
            mailbox,
            app,
        });
        let looping = Arc::clone(&shared);
        thread::spawn(move || run(&looping));
        let watching = Arc::clone(&shared);
        thread::spawn(move || keep_listening(&watching));
        Self { shared, config_folder }
    }

    /// Every gateway with how its checks are going.
    ///
    /// # Errors
    ///
    /// [`AppError::Poisoned`] after an earlier failure.
    pub fn list(&self) -> Result<Vec<GatewayStatusDto>, AppError> {
        statuses(&self.shared)
    }

    /// A check of every gateway to run now, off the window's thread.
    #[must_use]
    pub fn check_now_handle(&self) -> CheckNow {
        CheckNow(Arc::clone(&self.shared))
    }

    /// Checks an address and token against the gateway, then saves it under `name` and starts collecting from it.
    ///
    /// # Errors
    ///
    /// The gateway's refusal or unreachability, in words.
    pub fn add(&self, name: &str, url: &str, token: &str) -> Result<Vec<GatewayStatusDto>, String> {
        let url = url.trim().trim_end_matches('/');
        if !(url.starts_with("https://") || url.starts_with("http://localhost") || url.starts_with("http://127.0.0.1")) {
            return Err("The gateway address must start with https:// (or http://localhost for one on this computer).".to_owned());
        }
        let name = if name.trim().is_empty() { url.trim_start_matches("https://").to_owned() } else { name.trim().to_owned() };
        GatewayClient::new(url, token).waiting().map_err(|error| error.to_string())?;
        {
            let mut gateways = self.shared.gateways.lock().map_err(|_| AppError::Poisoned.to_string())?;
            if gateways.iter().any(|gateway| gateway.url == url && gateway.token == token.trim()) {
                return Err("That gateway and token are already connected.".to_owned());
            }
            let id = format!("gateway-{}", unix_now());
            gateways.push(GatewaySettings { id, name, url: url.to_owned(), token: token.trim().to_owned() });
            settings::save(&self.config_folder, &gateways).map_err(|error| error.to_string())?;
        }
        self.check_now();
        self.list().map_err(|error| error.to_string())
    }

    /// Forgets one gateway. Mail already taken in stays.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the settings cannot be saved.
    pub fn remove(&self, id: &str) -> Result<Vec<GatewayStatusDto>, AppError> {
        {
            let mut gateways = self.shared.gateways.lock()?;
            gateways.retain(|gateway| gateway.id != id);
            settings::save(&self.config_folder, &gateways)?;
        }
        self.shared.progress.lock()?.remove(id);
        self.shared.connected.lock()?.remove(id);
        self.shared.legacy.lock()?.remove(id);
        self.list()
    }

    /// Wakes the loop for a check of every gateway now.
    pub fn check_now(&self) {
        if let Ok(mut woken) = self.shared.woken.lock() {
            *woken = true;
            self.shared.wake.notify_all();
        }
    }

    /// The client for one saved gateway, or the reason there is none.
    fn client(&self, id: &str) -> Result<GatewayClient, String> {
        let gateways = self.shared.gateways.lock().map_err(|_| AppError::Poisoned.to_string())?;
        gateways
            .iter()
            .find(|gateway| gateway.id == id)
            .map(|gateway| GatewayClient::new(&gateway.url, &gateway.token))
            .ok_or_else(|| "That gateway is no longer connected.".to_owned())
    }

    /// The domains a gateway receives for.
    ///
    /// # Errors
    ///
    /// The reason in words when the gateway is not connected or cannot be reached.
    pub fn domains(&self, id: &str) -> Result<Vec<OwnedDomain>, String> {
        self.client(id)?.domains().map_err(|error| error.to_string())
    }

    /// The domains in a gateway's Cloudflare account that could be added.
    ///
    /// # Errors
    ///
    /// As for [`SyncService::domains`].
    pub fn available_domains(&self, id: &str) -> Result<Vec<AvailableZone>, String> {
        self.client(id)?.available().map_err(|error| error.to_string())
    }

    /// Adds a domain at a gateway, routed by its own account's catch-all or through a relay.
    ///
    /// # Errors
    ///
    /// The gateway's refusal in its own words.
    pub fn add_domain(&self, id: &str, domain: &str, via: DomainRoute) -> Result<OwnedDomain, String> {
        self.client(id)?.add_domain(domain, via).map_err(|error| error.to_string())
    }

    /// Removes a domain at a gateway, which restores its old catch-all when it was routed by one.
    ///
    /// # Errors
    ///
    /// The gateway's refusal in its own words.
    pub fn remove_domain(&self, id: &str, domain: &str) -> Result<(), String> {
        self.client(id)?.remove_domain(domain).map_err(|error| error.to_string())
    }
}

/// Every gateway with how its checks are going.
fn statuses(shared: &Shared) -> Result<Vec<GatewayStatusDto>, AppError> {
    let gateways = shared.gateways.lock()?;
    let progress = shared.progress.lock()?;
    Ok(gateways
        .iter()
        .map(|gateway| {
            let seen = progress.get(&gateway.id).cloned().unwrap_or_default();
            GatewayStatusDto {
                id: gateway.id.clone(),
                name: gateway.name.clone(),
                url: gateway.url.clone(),
                last_checked: seen.last_checked,
                received: seen.received,
                problem: seen.problem,
            }
        })
        .collect())
}

/// Keeps one live listener per gateway: started for a new gateway, ended when its gateway is removed or its token
/// changes. Looks every [`LISTENER_SCAN`]. Each listener wakes the loop on an arrival or a (re)connection, and keeps
/// [`Shared::connected`] true to the socket, which sets how often the safety check runs.
fn keep_listening(shared: &Arc<Shared>) {
    let running: Arc<Mutex<HashSet<String>>> = Arc::default();
    loop {
        let gateways = shared.gateways.lock().map(|gateways| gateways.clone()).unwrap_or_default();
        for gateway in gateways {
            let fresh = running.lock().is_ok_and(|mut set| set.insert(gateway.id.clone()));
            if !fresh {
                continue;
            }
            let shared = Arc::clone(shared);
            let running = Arc::clone(&running);
            thread::spawn(move || {
                let wake = || {
                    if let Ok(mut woken) = shared.woken.lock() {
                        *woken = true;
                        shared.wake.notify_all();
                    }
                };
                let mark = |up: bool| {
                    if let Ok(mut connected) = shared.connected.lock() {
                        if up {
                            connected.insert(gateway.id.clone());
                        } else {
                            connected.remove(&gateway.id);
                        }
                    }
                };
                let still_here = || shared.gateways.lock().is_ok_and(|now| now.iter().any(|kept| kept.id == gateway.id && kept.token == gateway.token));
                push::listen(&gateway.url, &gateway.token, Heartbeat::default(), &Listener { on_arrival: &wake, on_state: &mark, keep_going: &still_here });
                mark(false);
                if let Ok(mut set) = running.lock() {
                    set.remove(&gateway.id);
                }
            });
        }
        thread::sleep(LISTENER_SCAN);
    }
}

/// True when every saved gateway's WebSocket is up, so the safety check can wait the long [`SAFETY_EVERY`].
fn all_connected(shared: &Shared) -> bool {
    let Ok(gateways) = shared.gateways.lock() else { return false };
    let Ok(connected) = shared.connected.lock() else { return false };
    gateways.iter().all(|gateway| connected.contains(&gateway.id))
}

/// The loop: collects when woken (an arrival, a connection, the app starting, Check now), and otherwise only when the
/// safety check is due. It wakes at least every [`DOWN_EVERY`] to look, which costs no request.
fn run(shared: &Shared) {
    let mut last_check: Option<Instant> = None;
    loop {
        let woken = {
            let Ok(woken) = shared.woken.lock() else { return };
            let Ok((mut woken, _)) = shared.wake.wait_timeout_while(woken, DOWN_EVERY, |woken| !*woken) else { return };
            std::mem::take(&mut *woken)
        };
        let due = if all_connected(shared) { SAFETY_EVERY } else { DOWN_EVERY };
        if woken || last_check.is_none_or(|at| at.elapsed() >= due) {
            check_all(shared);
            last_check = Some(Instant::now());
        }
    }
}

/// Checks every gateway once, records how each went, announces what arrived, and returns how many messages did.
fn check_all(shared: &Shared) -> usize {
    let Ok(_one_at_a_time) = shared.checking.lock() else { return 0 };
    let gateways = shared.gateways.lock().map(|gateways| gateways.clone()).unwrap_or_default();
    let mut arrived = Vec::new();
    for gateway in gateways {
        let mut legacy = shared.legacy.lock().is_ok_and(|set| set.contains(&gateway.id));
        let outcome = collect(&GatewayClient::new(&gateway.url, &gateway.token), &shared.mailbox, &mut legacy);
        if legacy && let Ok(mut set) = shared.legacy.lock() {
            set.insert(gateway.id.clone());
        }
        if let Ok(mut progress) = shared.progress.lock() {
            let entry = progress.entry(gateway.id.clone()).or_default();
            entry.last_checked = Some(buun_mail_message::rfc3339(unix_now()));
            match &outcome {
                Ok(found) => {
                    entry.problem = None;
                    entry.received += u32::try_from(found.len()).unwrap_or(u32::MAX);
                }
                Err(error) => entry.problem = Some(error.to_string()),
            }
        }
        if let Ok(found) = outcome {
            arrived.extend(found);
        }
    }
    if let Some(app) = &shared.app {
        events::mail_arrived(app, &arrived);
        if !arrived.is_empty() {
            events::mail_changed(app);
        }
    }
    arrived.len()
}
