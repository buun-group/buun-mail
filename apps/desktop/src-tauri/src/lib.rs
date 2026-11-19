//! The Buun Mail desktop shell: loads the mailbox, hands it to the UI through a few typed commands.

mod commands;
mod demo;
mod dto;
mod mailbox;

use tauri::Manager;

pub use mailbox::{LoadError, Mailbox};

/// Starts the app. Exits with the reason when the mailbox cannot be loaded, since there is nothing to show without it.
///
/// # Panics
///
/// Never on its own: a failure to start the window is reported by Tauri and ends the process.
#[allow(clippy::expect_used, reason = "nothing can run if the window fails to start, and Tauri has already said why")]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.manage(Mailbox::demo()?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![commands::list_workspaces, commands::list_messages])
        .run(tauri::generate_context!())
        .expect("the Buun Mail window could not start");
}
