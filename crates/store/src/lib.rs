//! The local store: every message Buun Mail has, on this computer.
//!
//! Two halves, kept in one folder:
//! - `index.sqlite`: one row per message with what the list needs and where routing put it.
//! - `raw/`: each message's original bytes as an `.eml` file, named by its content id, read back for the reader.
//!
//! The store knows nothing about parsing or routing; the app hands it finished [`MessageRecord`]s.

mod error;
mod raw;
mod record;
mod schema;
mod store;

pub use error::StoreError;
pub use record::{MessageRecord, Placement, UnreadCount};
pub use store::{Inserted, Store};
