//! The Buun Mail desktop shell: opens the mailbox (routing file and local store) and hands it to the UI through a few
//! typed commands.
//!
//! - `paths`: where the routing file and the store live on this platform
//! - `ingest`: parse, route and store one message; every mail source goes through it
//! - `mailbox`: what the UI reads and changes, on top of the store
//! - `commands`: the thin Tauri commands
//! - `dto`: the shapes sent to the UI
//! - `error`: the one error the commands return

mod commands;
mod dto;
mod error;
mod ingest;
mod mailbox;
mod paths;

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
        .setup(|app| {
            let paths = AppPaths::resolve(app.handle())?;
            app.manage(Mailbox::open(&paths)?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_workspaces,
            commands::list_messages,
            commands::open_message,
            commands::mark_all_read,
            commands::import_files,
            commands::routing_path,
        ])
        .run(tauri::generate_context!())
        .expect("the Buun Mail window could not start");
}
