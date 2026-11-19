//! The Buun Mail desktop shell: opens the mailbox (routing file and local store) and hands it to the UI through a few
//! typed commands.
//!
//! - `agent`: the MCP server agents connect to, off until turned on
//! - `paths`: where the routing file and the store live on this platform
//! - `sync`: collecting mail from the Buun Mail Gateway
//! - `ingest`: parse, route and store one message; every mail source goes through it
//! - `mailbox`: what the UI and agents read and change, on top of the store
//! - `commands`: the thin Tauri commands
//! - `events`: what the Rust side tells the UI unasked, such as new mail
//! - `dto`: the shapes sent to the UI
//! - `error`: the one error the commands return

mod agent;
mod commands;
mod dto;
mod error;
mod events;
mod ingest;
mod mailbox;
mod paths;
mod sync;

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
        .setup(|app| {
            let paths = AppPaths::resolve(app.handle())?;
            let mailbox = Arc::new(Mailbox::open(&paths)?);
            app.manage(agent::AgentState::open(paths.config.clone(), Arc::clone(&mailbox), Some(app.handle().clone()))?);
            app.manage(sync::SyncService::start(paths.config.clone(), Arc::clone(&mailbox), Some(app.handle().clone())));
            app.manage(mailbox);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_workspaces,
            commands::list_messages,
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
            commands::gateway_status,
            commands::connect_gateway,
            commands::disconnect_gateway,
            commands::check_gateway,
            commands::gateway_domains,
            commands::gateway_available_domains,
            commands::add_gateway_domain,
            commands::remove_gateway_domain,
        ])
        .run(tauri::generate_context!())
        .expect("the Buun Mail window could not start");
}
