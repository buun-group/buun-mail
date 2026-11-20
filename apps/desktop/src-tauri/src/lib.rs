//! The Buun Mail desktop shell: opens the mailbox (routing file and local store) and hands it to the UI through a few
//! typed commands.
//!
//! - `agent`: the MCP server agents connect to, off until turned on
//! - `paths`: where the routing file and the store live on this platform
//! - `sync`: collecting mail from the Buun Mail Gateway
//! - `send`: sending through a connected service such as Resend
//! - `imap`: collecting from IMAP mailboxes
//! - `later`: messages scheduled to go later, and reminders when nobody answers
//! - `alerts`: telling you elsewhere (Slack, a text, an email) when a rule matches arriving mail
//! - `writing`: templates, and each workspace's signature and address for new mail
//! - `backup`: the whole mailbox and settings in one passphrase-sealed file, and restoring one
//! - `vault`: secrets sealed at rest under this install's key, and the code asked before showing one
//! - `dissolve`: dissolve.email's disposable inboxes as a workspace, after signing in with OAuth
//! - `ingest`: parse, route and store one message; every mail source goes through it
//! - `mailbox`: what the UI and agents read and change, on top of the store
//! - `commands`: the thin Tauri commands
//! - `events`: what the Rust side tells the UI unasked, such as new mail
//! - `dto`: the shapes sent to the UI
//! - `error`: the one error the commands return

mod agent;
mod alerts;
mod backup;
mod commands;
mod dissolve;
mod dto;
mod error;
mod events;
mod imap;
mod ingest;
mod later;
mod mailbox;
mod paths;
mod send;
mod sync;
mod vault;
mod writing;

use std::sync::Arc;

use tauri::Manager;

pub use error::AppError;
pub use mailbox::Mailbox;
pub use paths::AppPaths;

/// Starts the app. Exits with the reason when the mailbox cannot open, since there is nothing to show without it.
///
/// # Panics
///
/// Never on its own: a failure to start the window is reported by Tauri and ends the process.
#[allow(clippy::expect_used, reason = "nothing can run if the window fails to start, and Tauri has already said why")]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(start)
        .invoke_handler(tauri::generate_handler![
            commands::list_workspaces,
            commands::list_messages,
            commands::list_view,
            commands::set_messages_unread,
            commands::set_messages_starred,
            commands::shelve_messages,
            commands::delete_messages_forever,
            commands::empty_trash,
            commands::move_message,
            commands::export_messages,
            commands::save_attachment,
            commands::list_senders,
            commands::add_resend_sender,
            commands::refresh_senders,
            commands::update_sender,
            commands::remove_sender,
            commands::sendable_domains,
            commands::send_message,
            commands::suggest_contacts,
            commands::thread_messages,
            commands::search_all,
            commands::snooze_messages,
            commands::list_contacts,
            commands::attachment_data,
            commands::open_attachment,
            commands::describe_files,
            commands::add_smtp_sender,
            commands::list_imap_accounts,
            commands::add_imap_account,
            commands::remove_imap_account,
            commands::check_imap_accounts,
            commands::dissolve_status,
            commands::connect_dissolve,
            commands::disconnect_dissolve,
            commands::check_dissolve,
            commands::set_dissolve_keep,
            commands::create_dissolve_inbox,
            commands::dissolve_domains,
            commands::extend_dissolve_inbox,
            commands::burn_dissolve_inbox,
            commands::reveal_status,
            commands::set_reveal_code,
            commands::lock_reveals,
            commands::reveal_secret,
            commands::list_alerts,
            commands::add_alert,
            commands::remove_alert,
            commands::test_alert,
            commands::unsubscribe_one_click,
            commands::schedule_send,
            commands::list_scheduled,
            commands::cancel_scheduled,
            commands::send_scheduled_now,
            commands::remind_if_no_reply,
            commands::list_reminders,
            commands::cancel_reminder,
            commands::read_writing,
            commands::save_template,
            commands::delete_template,
            commands::save_profile,
            commands::message_note,
            commands::set_message_note,
            commands::set_local_offset,
            commands::send_digest_now,
            commands::create_backup,
            commands::restore_backup,
            commands::open_message,
            commands::mark_all_read,
            commands::tag_message,
            commands::untag_message,
            commands::list_tags,
            commands::list_rules,
            commands::save_rule,
            commands::delete_rule,
            commands::apply_rules,
            commands::list_activity,
            commands::import_files,
            commands::routing_path,
            commands::agent_status,
            commands::set_agent_enabled,
            commands::regenerate_agent_token,
            commands::list_gateways,
            commands::add_gateway,
            commands::remove_gateway,
            commands::check_gateways,
            commands::gateway_domains,
            commands::gateway_available_domains,
            commands::add_gateway_domain,
            commands::remove_gateway_domain,
        ])
        .run(tauri::generate_context!())
        .expect("the Buun Mail window could not start");
}

/// Snoozed mail comes back when its time is up: checked every minute, announced like new mail.
fn wake_snoozed(mailbox: Arc<Mailbox>, app: tauri::AppHandle) {
    std::thread::spawn(move || {
        loop {
            if let Ok(woken) = mailbox.wake_due()
                && !woken.is_empty()
            {
                events::mail_arrived(&app, &woken);
                events::mail_changed(&app);
            }
            std::thread::sleep(std::time::Duration::from_secs(60));
        }
    });
}

/// Mail stored before conversations, search, sizes and sender checks is caught up in the background, a batch at a time.
fn catch_up(mailbox: Arc<Mailbox>, app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut done = 0;
        while let Ok(count @ 1..) = mailbox.catch_up(200) {
            done += count;
        }
        if done > 0 {
            events::mail_changed(&app);
        }
    });
}

/// Opens the mailbox and starts every service, before the window shows.
fn start(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let paths = AppPaths::resolve(app.handle())?;
    // A restore staged last time goes in before anything opens the folders it replaces.
    let backup_paths = backup::BackupPaths { config: paths.config.clone(), store: paths.store.clone() };
    backup::apply_pending(&backup_paths, mailbox::unix_now())?;
    app.manage(backup_paths);
    // Before anything reads a settings file: the install's key, and any plain secret an older version left, sealed.
    vault::open(&paths.config)?;
    app.manage(vault::reveal::RevealLock::open(&paths.config));
    let mailbox = Arc::new(Mailbox::open(&paths)?);
    // Mail in the trash longer than thirty days goes for good. A failure here never stops the app opening.
    let _ = mailbox.empty_trash(true, &mailbox::Actor::App);
    catch_up(Arc::clone(&mailbox), app.handle().clone());
    app.manage(agent::AgentState::open(paths.config.clone(), Arc::clone(&mailbox), Some(app.handle().clone()))?);
    app.manage(sync::SyncService::start(paths.config.clone(), Arc::clone(&mailbox), Some(app.handle().clone())));
    wake_snoozed(Arc::clone(&mailbox), app.handle().clone());
    let send = send::SendService::open(paths.config.clone(), Arc::clone(&mailbox));
    app.manage(alerts::AlertService::start(paths.config.clone(), &mailbox, send.clone()));
    app.manage(later::LaterService::start(paths.config.clone(), &mailbox, send.clone(), Some(app.handle().clone())));
    app.manage(send);
    app.manage(imap::ImapService::start(paths.config.clone(), Arc::clone(&mailbox), Some(app.handle().clone())));
    app.manage(dissolve::DissolveService::start(paths.config.clone(), Arc::clone(&mailbox), Some(app.handle().clone())));
    app.manage(writing::WritingStore::open(paths.config.clone()));
    app.manage(mailbox);
    Ok(())
}
