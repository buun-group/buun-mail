//! The store itself: insert, list, read, mark read.

use std::fs;
use std::path::Path;

use rusqlite::{Connection, OptionalExtension, Row, params};

use crate::error::StoreError;
use crate::raw::RawFiles;
use crate::record::{MessageRecord, Placement, UnreadCount};
use crate::schema::migrate;

/// The index file's name inside the store folder.
const INDEX_FILE: &str = "index.sqlite";

/// The raw messages' folder name inside the store folder.
const RAW_DIR: &str = "raw";

/// Every column of a message row, in the order [`record_from_row`] reads them.
const COLUMNS: &str = "id, workspace, folder, matched, folder_matched, from_name, from_address, to_address, subject, preview, sent_at, message_id, unread";

/// What happened to a message handed to [`Store::insert`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Inserted {
    /// It was new and is now stored.
    New,
    /// The same bytes were already stored; nothing changed.
    Duplicate,
}

/// The local store. Open one per app; it is not shared across threads, so callers hold it behind a lock.
#[derive(Debug)]
pub struct Store {
    index: Connection,
    raw: RawFiles,
}

impl Store {
    /// Opens the store in `folder`, creating it and moving its schema forward as needed.
    ///
    /// # Errors
    ///
    /// [`StoreError`] when the folder cannot be created or the index cannot be opened.
    pub fn open(folder: &Path) -> Result<Self, StoreError> {
        fs::create_dir_all(folder)?;
        let mut index = Connection::open(folder.join(INDEX_FILE))?;
        index.pragma_update(None, "journal_mode", "WAL")?;
        migrate(&mut index)?;
        Ok(Self { index, raw: RawFiles::new(folder.join(RAW_DIR)) })
    }

    /// The folder the raw messages are kept in.
    #[must_use]
    pub fn raw_folder(&self) -> &Path {
        self.raw.root()
    }

    /// Stores a message and its raw bytes. The same bytes twice store once.
    ///
    /// # Errors
    ///
    /// [`StoreError`] when the file or the row cannot be written.
    pub fn insert(&self, record: &MessageRecord, raw: &[u8]) -> Result<Inserted, StoreError> {
        if self.contains(&record.id)? {
            return Ok(Inserted::Duplicate);
        }
        // The file first: a row must never point at bytes that are not there.
        self.raw.write(&record.id, raw)?;
        self.index.execute(
            &format!("INSERT INTO messages ({COLUMNS}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)"),
            params![
                record.id,
                record.placement.workspace,
                record.placement.folder,
                record.matched,
                record.folder_matched,
                record.from_name,
                record.from,
                record.to,
                record.subject,
                record.preview,
                record.sent_at,
                record.message_id,
                record.unread,
            ],
        )?;
        Ok(Inserted::New)
    }

    /// The messages in one folder, newest first.
    ///
    /// # Errors
    ///
    /// [`StoreError`] when the index cannot be read.
    pub fn list(&self, placement: &Placement) -> Result<Vec<MessageRecord>, StoreError> {
        let mut statement =
            self.index.prepare_cached(&format!("SELECT {COLUMNS} FROM messages WHERE workspace = ?1 AND folder IS ?2 ORDER BY sent_at DESC"))?;
        let rows = statement.query_map(params![placement.workspace, placement.folder], record_from_row)?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// One message's row.
    ///
    /// # Errors
    ///
    /// [`StoreError::NotFound`] for an unknown id, or when the index cannot be read.
    pub fn get(&self, id: &str) -> Result<MessageRecord, StoreError> {
        self.index
            .query_row(&format!("SELECT {COLUMNS} FROM messages WHERE id = ?1"), [id], record_from_row)
            .optional()?
            .ok_or_else(|| StoreError::NotFound(id.to_owned()))
    }

    /// One message's original bytes.
    ///
    /// # Errors
    ///
    /// [`StoreError`] when the file is missing or unreadable.
    pub fn raw(&self, id: &str) -> Result<Vec<u8>, StoreError> {
        Ok(self.raw.read(id)?)
    }

    /// Unread messages per folder, for the sidebar. Folders with none are left out.
    ///
    /// # Errors
    ///
    /// [`StoreError`] when the index cannot be read.
    pub fn unread_counts(&self) -> Result<Vec<UnreadCount>, StoreError> {
        let mut statement = self.index.prepare_cached("SELECT workspace, folder, COUNT(*) FROM messages WHERE unread = 1 GROUP BY workspace, folder")?;
        let rows =
            statement.query_map([], |row| Ok(UnreadCount { placement: Placement { workspace: row.get(0)?, folder: row.get(1)? }, unread: row.get(2)? }))?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// Every folder that holds at least one message, so the sidebar can show folders the routing file no longer names.
    ///
    /// # Errors
    ///
    /// [`StoreError`] when the index cannot be read.
    pub fn placements(&self) -> Result<Vec<Placement>, StoreError> {
        let mut statement = self.index.prepare_cached("SELECT DISTINCT workspace, folder FROM messages")?;
        let rows = statement.query_map([], |row| Ok(Placement { workspace: row.get(0)?, folder: row.get(1)? }))?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// Marks one message read. Returns false when it was already read or does not exist.
    ///
    /// # Errors
    ///
    /// [`StoreError`] when the index cannot be written.
    pub fn mark_read(&self, id: &str) -> Result<bool, StoreError> {
        Ok(self.index.execute("UPDATE messages SET unread = 0 WHERE id = ?1 AND unread = 1", [id])? == 1)
    }

    /// Marks every message in a folder read, or in a whole workspace when `folder` is `None` and `whole_workspace` is set.
    /// Returns how many changed.
    ///
    /// # Errors
    ///
    /// [`StoreError`] when the index cannot be written.
    pub fn mark_all_read(&self, placement: &Placement, whole_workspace: bool) -> Result<usize, StoreError> {
        let changed = if whole_workspace {
            self.index.execute("UPDATE messages SET unread = 0 WHERE workspace = ?1 AND unread = 1", [&placement.workspace])?
        } else {
            self.index.execute(
                "UPDATE messages SET unread = 0 WHERE workspace = ?1 AND folder IS ?2 AND unread = 1",
                params![placement.workspace, placement.folder],
            )?
        };
        Ok(changed)
    }

    fn contains(&self, id: &str) -> Result<bool, StoreError> {
        Ok(self.index.query_row("SELECT 1 FROM messages WHERE id = ?1", [id], |_| Ok(())).optional()?.is_some())
    }
}

/// Reads one row in [`COLUMNS`] order.
fn record_from_row(row: &Row<'_>) -> rusqlite::Result<MessageRecord> {
    Ok(MessageRecord {
        id: row.get(0)?,
        placement: Placement { workspace: row.get(1)?, folder: row.get(2)? },
        matched: row.get(3)?,
        folder_matched: row.get(4)?,
        from_name: row.get(5)?,
        from: row.get(6)?,
        to: row.get(7)?,
        subject: row.get(8)?,
        preview: row.get(9)?,
        sent_at: row.get(10)?,
        message_id: row.get(11)?,
        unread: row.get(12)?,
    })
}
