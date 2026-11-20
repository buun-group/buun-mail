//! Backups: the whole mailbox and settings in one file sealed with a passphrase, to keep or to move to another
//! computer, and restoring one.
//!
//! - `seal`: the file format: an Argon2id key from the passphrase, then XChaCha20-Poly1305 in numbered 1 MiB chunks
//! - `archive`: what goes in (the config folder, the store) and putting it back
//!
//! A restore is unpacked beside the current data and swapped in at the next start, so nothing changes under the
//! running app; the data it replaces is kept in a `before-restore` folder.

mod archive;
mod seal;
#[cfg(test)]
mod tests;

pub use archive::{BackupPaths, apply_pending, create, stage_restore};

/// The shortest passphrase accepted.
pub const SHORTEST: usize = 8;
