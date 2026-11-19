//! The Buun Mail binary. All the work is in the library so it can be tested without a window.

// No console window behind the app on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    buun_mail_desktop::run();
}
