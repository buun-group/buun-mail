//! The store itself: insert, list, read, mark read.

use std::fs;
use std::path::Path;

use rusqlite::{Connection, OptionalExtension, Row, params};

use crate::error::StoreError;
use crate::raw::RawFiles;
use crate::record::{Activity, MessageRecord, Placement, Shelf, StoredRule, UnreadCount, View};
use crate::schema::migrate;

/// The index file's name inside the store folder.
const INDEX_FILE: &str = "index.sqlite";

/// The raw messages' folder name inside the store folder.
const RAW_DIR: &str = "raw";

/// Every column of a message row, in the order [`record_from_row`] reads them. Tags come last, joined with [`TAG_SEPARATOR`].
const COLUMNS: &str = "id, workspace, folder, matched, folder_matched, from_name, from_address, to_address, subject, preview, sent_at, message_id, unread, starred, shelf, thread_id, snoozed_until, \
    (SELECT COUNT(*) FROM messages AS thread WHERE thread.thread_id = messages.thread_id AND thread.shelf != 'trashed'), \
    (SELECT group_concat(tag, char(31)) FROM (SELECT tag FROM tags WHERE tags.message_id = messages.id ORDER BY tag)), size, checks";

/// The columns written on insert, without the derived tags.
const INSERT_COLUMNS: &str = "id, workspace, folder, matched, folder_matched, from_name, from_address, to_address, subject, preview, sent_at, message_id, unread, starred, shelf, size, checks";

/// Joins a message's tags in one column. The unit separator never appears in a tag.
const TAG_SEPARATOR: char = '\u{1f}';

/// How many results a search returns at most.
pub const SEARCH_LIMIT: usize = 200;

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
        index.pragma_update(None, "foreign_keys", true)?;
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
            &format!("INSERT INTO messages ({INSERT_COLUMNS}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)"),
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
                record.starred,
                record.shelf.as_str(),
                record.size,
                record.checks,
            ],
        )?;
        self.add_tags(&record.id, &record.tags)?;
        Ok(Inserted::New)
    }

    /// The messages in one folder, newest first.
    ///
    /// # Errors
    ///
    /// [`StoreError`] when the index cannot be read.
    pub fn list(&self, placement: &Placement) -> Result<Vec<MessageRecord>, StoreError> {
        let mut statement = self.index.prepare_cached(&format!(
            "SELECT {COLUMNS} FROM messages WHERE workspace = ?1 AND folder IS ?2 AND shelf = 'active' AND snoozed_until IS NULL ORDER BY sent_at DESC"
        ))?;
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
        let mut statement = self.index.prepare_cached(
            "SELECT workspace, folder, COUNT(*) FROM messages WHERE unread = 1 AND shelf = 'active' AND snoozed_until IS NULL GROUP BY workspace, folder",
        )?;
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
            self.index.execute("UPDATE messages SET unread = 0 WHERE workspace = ?1 AND unread = 1 AND shelf = 'active'", [&placement.workspace])?
        } else {
            self.index.execute(
                "UPDATE messages SET unread = 0 WHERE workspace = ?1 AND folder IS ?2 AND unread = 1 AND shelf = 'active'",
                params![placement.workspace, placement.folder],
            )?
        };
        Ok(changed)
    }

    /// Messages whose subject, sender, recipient, preview or tag contains `query` (case-insensitive), newest first,
    /// optionally within one workspace, and only unread ones when asked.
    ///
    /// # Errors
    ///
    /// [`StoreError`] when the index cannot be read.
    pub fn search(&self, query: &str, workspace: Option<&str>, unread_only: bool, limit: usize) -> Result<Vec<MessageRecord>, StoreError> {
        let pattern = like_pattern(query);
        let mut statement = self.index.prepare_cached(&format!(
            "SELECT {COLUMNS} FROM messages WHERE (?1 = '%%' OR subject LIKE ?1 ESCAPE '\\' OR from_address LIKE ?1 ESCAPE '\\' OR from_name LIKE ?1 ESCAPE '\\' \
             OR to_address LIKE ?1 ESCAPE '\\' OR preview LIKE ?1 ESCAPE '\\' OR EXISTS (SELECT 1 FROM tags WHERE tags.message_id = messages.id AND tag LIKE ?1 ESCAPE '\\')) \
             AND (?2 IS NULL OR workspace = ?2) AND (?3 = 0 OR unread = 1) AND shelf != 'trashed' ORDER BY sent_at DESC LIMIT ?4"
        ))?;
        let limit = i64::try_from(limit.min(SEARCH_LIMIT)).unwrap_or(0);
        let rows = statement.query_map(params![pattern, workspace, unread_only, limit], record_from_row)?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// Adds tags to a message. Tags already there are left alone; empty ones are skipped.
    ///
    /// # Errors
    ///
    /// [`StoreError::NotFound`] for an unknown id, or when the index cannot be written.
    pub fn add_tags(&self, id: &str, tags: &[String]) -> Result<(), StoreError> {
        if !tags.is_empty() && !self.contains(id)? {
            return Err(StoreError::NotFound(id.to_owned()));
        }
        let mut statement = self.index.prepare_cached("INSERT OR IGNORE INTO tags (message_id, tag) VALUES (?1, ?2)")?;
        for tag in tags.iter().map(|tag| tag.trim()).filter(|tag| !tag.is_empty()) {
            statement.execute(params![id, tag])?;
        }
        Ok(())
    }

    /// Removes one tag from a message. Returns false when it did not have it.
    ///
    /// # Errors
    ///
    /// [`StoreError`] when the index cannot be written.
    pub fn remove_tag(&self, id: &str, tag: &str) -> Result<bool, StoreError> {
        Ok(self.index.execute("DELETE FROM tags WHERE message_id = ?1 AND tag = ?2", params![id, tag])? == 1)
    }

    /// Every tag in use, with how many messages carry it, most used first.
    ///
    /// # Errors
    ///
    /// [`StoreError`] when the index cannot be read.
    pub fn tag_counts(&self) -> Result<Vec<(String, u32)>, StoreError> {
        let mut statement = self.index.prepare_cached("SELECT tag, COUNT(*) FROM tags GROUP BY tag ORDER BY COUNT(*) DESC, tag")?;
        let rows = statement.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// Moves a message to another workspace or folder, overriding where routing put it.
    ///
    /// # Errors
    ///
    /// [`StoreError::NotFound`] for an unknown id, or when the index cannot be written.
    pub fn move_to(&self, id: &str, placement: &Placement) -> Result<(), StoreError> {
        let changed =
            self.index.execute("UPDATE messages SET workspace = ?2, folder = ?3 WHERE id = ?1", params![id, placement.workspace, placement.folder])?;
        if changed == 0 {
            return Err(StoreError::NotFound(id.to_owned()));
        }
        Ok(())
    }

    /// The messages in a list across every workspace: starred, archived or the trash.
    ///
    /// # Errors
    ///
    /// [`StoreError`] when the index cannot be read.
    pub fn view(&self, view: View) -> Result<Vec<MessageRecord>, StoreError> {
        let filter = match view {
            View::Starred => "starred = 1 AND shelf != 'trashed' AND snoozed_until IS NULL ORDER BY sent_at DESC",
            View::Archived => "shelf = 'archived' ORDER BY shelved_at DESC, sent_at DESC",
            View::Trashed => "shelf = 'trashed' ORDER BY shelved_at DESC, sent_at DESC",
            View::Snoozed => "snoozed_until IS NOT NULL AND shelf != 'trashed' ORDER BY snoozed_until",
        };
        let mut statement = self.index.prepare_cached(&format!("SELECT {COLUMNS} FROM messages WHERE {filter}"))?;
        let rows = statement.query_map([], record_from_row)?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// Marks one message read or unread. Returns false when it already was, or does not exist.
    ///
    /// # Errors
    ///
    /// [`StoreError`] when the index cannot be written.
    pub fn set_unread(&self, id: &str, unread: bool) -> Result<bool, StoreError> {
        Ok(self.index.execute("UPDATE messages SET unread = ?2 WHERE id = ?1 AND unread != ?2", params![id, unread])? == 1)
    }

    /// Stars or unstars one message. Returns false when it already was, or does not exist.
    ///
    /// # Errors
    ///
    /// [`StoreError`] when the index cannot be written.
    pub fn set_starred(&self, id: &str, starred: bool) -> Result<bool, StoreError> {
        Ok(self.index.execute("UPDATE messages SET starred = ?2 WHERE id = ?1 AND starred != ?2", params![id, starred])? == 1)
    }

    /// Archives, trashes or restores one message, noting when (`at`, Unix seconds). It keeps its workspace and folder.
    /// Returns false when it already was there, or does not exist.
    ///
    /// # Errors
    ///
    /// [`StoreError`] when the index cannot be written.
    pub fn set_shelf(&self, id: &str, to: Shelf, at: i64) -> Result<bool, StoreError> {
        Ok(self.index.execute("UPDATE messages SET shelf = ?2, shelved_at = ?3 WHERE id = ?1 AND shelf != ?2", params![id, to.as_str(), at])? == 1)
    }

    /// Snoozes one message until `until` (Unix seconds), or wakes it now with `None`. Returns false for an unknown id.
    ///
    /// # Errors
    ///
    /// [`StoreError`] when the index cannot be written.
    pub fn set_snooze(&self, id: &str, until: Option<i64>) -> Result<bool, StoreError> {
        Ok(self.index.execute("UPDATE messages SET snoozed_until = ?2 WHERE id = ?1", params![id, until])? == 1)
    }

    /// Wakes every message whose snooze has ended by `now`: it is back in its folder and unread. Returns their ids.
    ///
    /// # Errors
    ///
    /// [`StoreError`] when the index cannot be written.
    pub fn wake_due(&self, now: i64) -> Result<Vec<String>, StoreError> {
        let ids: Vec<String> = {
            let mut statement = self.index.prepare_cached("SELECT id FROM messages WHERE snoozed_until IS NOT NULL AND snoozed_until <= ?1")?;
            statement.query_map([now], |row| row.get(0))?.collect::<rusqlite::Result<_>>()?
        };
        for id in &ids {
            self.index.execute("UPDATE messages SET snoozed_until = NULL, unread = 1 WHERE id = ?1", [id])?;
        }
        Ok(ids)
    }

    /// Up to `limit` messages stored before sizes and sender checks were kept, for catching up.
    ///
    /// # Errors
    ///
    /// [`StoreError`] when the index cannot be read.
    pub fn without_facts(&self, limit: usize) -> Result<Vec<String>, StoreError> {
        let mut statement = self.index.prepare_cached("SELECT id FROM messages WHERE size IS NULL LIMIT ?1")?;
        let rows = statement.query_map([i64::try_from(limit).unwrap_or(i64::MAX)], |row| row.get(0))?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// Records a message's size and sender checks.
    ///
    /// # Errors
    ///
    /// [`StoreError`] when the index cannot be written.
    pub fn set_facts(&self, id: &str, size: i64, checks: Option<&str>) -> Result<(), StoreError> {
        self.index.execute("UPDATE messages SET size = ?2, checks = ?3 WHERE id = ?1", params![id, size, checks])?;
        Ok(())
    }

    /// Deletes one message for good: its row, its tags and its bytes. Returns false when it did not exist.
    ///
    /// # Errors
    ///
    /// [`StoreError`] when the index or the file cannot be removed.
    pub fn delete(&self, id: &str) -> Result<bool, StoreError> {
        self.index.execute("DELETE FROM message_text WHERE id = ?1", [id])?;
        let removed = self.index.execute("DELETE FROM messages WHERE id = ?1", [id])? == 1;
        if removed {
            self.raw.remove(id)?;
        }
        Ok(removed)
    }

    /// The ids of messages in the trash since before `before` (Unix seconds), or every one when `before` is `None`.
    ///
    /// # Errors
    ///
    /// [`StoreError`] when the index cannot be read.
    pub fn trashed_before(&self, before: Option<i64>) -> Result<Vec<String>, StoreError> {
        let mut statement = self.index.prepare_cached("SELECT id FROM messages WHERE shelf = 'trashed' AND (?1 IS NULL OR shelved_at < ?1)")?;
        let rows = statement.query_map([before], |row| row.get(0))?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// People this mailbox has heard from, or written to from its Sent folders, whose name or address contains `query`,
    /// most messages first: `(name, address, how many messages, the latest one's time)`. A name is empty when none was
    /// ever given.
    ///
    /// # Errors
    ///
    /// [`StoreError`] when the index cannot be read.
    pub fn contacts(&self, query: &str, limit: usize) -> Result<Vec<(String, String, u32, i64)>, StoreError> {
        let pattern = like_pattern(query);
        let mut statement = self.index.prepare_cached(
            "SELECT MAX(name), address, SUM(seen), MAX(latest) FROM ( \
               SELECT from_name AS name, from_address AS address, COUNT(*) AS seen, MAX(sent_at) AS latest FROM messages \
                 WHERE folder IS NOT 'Sent' AND shelf != 'trashed' GROUP BY from_address \
               UNION ALL \
               SELECT '' AS name, to_address AS address, COUNT(*) AS seen, MAX(sent_at) AS latest FROM messages \
                 WHERE folder = 'Sent' AND shelf != 'trashed' GROUP BY to_address \
             ) WHERE address LIKE ?1 ESCAPE '\\' OR name LIKE ?1 ESCAPE '\\' \
             GROUP BY address ORDER BY SUM(seen) DESC, address LIMIT ?2",
        )?;
        let rows = statement.query_map(params![pattern, i64::try_from(limit).unwrap_or(0)], |row| {
            Ok((row.get::<_, Option<String>>(0)?.unwrap_or_default(), row.get(1)?, row.get(2)?, row.get(3)?))
        })?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// Puts a message in its conversation and returns the conversation's id. `header_id` is its own Message-ID and
    /// `parents` the ids it refers to (References and In-Reply-To). It joins the conversation of any parent already
    /// here, or gathers in replies that arrived before it; otherwise it starts one under its own Message-ID (or its id).
    ///
    /// # Errors
    ///
    /// [`StoreError`] when the index cannot be written.
    pub fn link(&self, id: &str, header_id: Option<&str>, parents: &[String]) -> Result<String, StoreError> {
        let mut add = self.index.prepare_cached("INSERT OR IGNORE INTO message_refs (message, ref) VALUES (?1, ?2)")?;
        for parent in parents {
            add.execute(params![id, parent])?;
        }
        let from_parent: Option<String> = self
            .index
            .query_row(
                "SELECT thread_id FROM messages WHERE thread_id IS NOT NULL AND message_id IN (SELECT ref FROM message_refs WHERE message = ?1) ORDER BY sent_at LIMIT 1",
                [id],
                |row| row.get(0),
            )
            .optional()?;
        let from_children: Vec<String> = match header_id {
            Some(own) => {
                let mut statement = self.index.prepare_cached(
                    "SELECT DISTINCT messages.thread_id FROM message_refs JOIN messages ON messages.id = message_refs.message WHERE message_refs.ref = ?1 AND messages.thread_id IS NOT NULL",
                )?;
                statement.query_map([own], |row| row.get(0))?.collect::<rusqlite::Result<_>>()?
            }
            None => Vec::new(),
        };
        let thread = from_parent.or_else(|| from_children.first().cloned()).or_else(|| header_id.map(str::to_owned)).unwrap_or_else(|| id.to_owned());
        self.index.execute("UPDATE messages SET thread_id = ?2 WHERE id = ?1", params![id, thread])?;
        for other in from_children.iter().filter(|other| **other != thread) {
            self.index.execute("UPDATE messages SET thread_id = ?2 WHERE thread_id = ?1", params![other, thread])?;
        }
        Ok(thread)
    }

    /// Ids of messages not yet put in a conversation or indexed, oldest first: mail stored before conversations existed.
    ///
    /// # Errors
    ///
    /// [`StoreError`] when the index cannot be read.
    pub fn unlinked(&self, limit: usize) -> Result<Vec<String>, StoreError> {
        let mut statement = self.index.prepare_cached("SELECT id FROM messages WHERE thread_id IS NULL ORDER BY sent_at LIMIT ?1")?;
        let rows = statement.query_map([i64::try_from(limit).unwrap_or(0)], |row| row.get(0))?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// Indexes a message's words for search: its subject, the people on it and its readable text.
    ///
    /// # Errors
    ///
    /// [`StoreError`] when the index cannot be written.
    pub fn index_text(&self, id: &str, subject: &str, people: &str, body: &str) -> Result<(), StoreError> {
        self.index.execute("DELETE FROM message_text WHERE id = ?1", [id])?;
        self.index.execute("INSERT INTO message_text (id, subject, people, body) VALUES (?1, ?2, ?3, ?4)", params![id, subject, people, body])?;
        Ok(())
    }

    /// Every message in a conversation outside the trash, oldest first.
    ///
    /// # Errors
    ///
    /// [`StoreError`] when the index cannot be read.
    pub fn thread(&self, thread_id: &str) -> Result<Vec<MessageRecord>, StoreError> {
        let mut statement =
            self.index.prepare_cached(&format!("SELECT {COLUMNS} FROM messages WHERE thread_id = ?1 AND shelf != 'trashed' ORDER BY sent_at"))?;
        let rows = statement.query_map([thread_id], record_from_row)?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// Messages anywhere outside the trash whose subject, people or text hold every word of `query` (each word also
    /// matching as the start of a longer one), best matches first.
    ///
    /// # Errors
    ///
    /// [`StoreError`] when the index cannot be read.
    pub fn search_text(&self, query: &str, limit: usize) -> Result<Vec<MessageRecord>, StoreError> {
        let words: Vec<String> =
            query.split_whitespace().map(|word| word.replace('"', "")).filter(|word| !word.is_empty()).map(|word| format!("\"{word}\"*")).collect();
        if words.is_empty() {
            return Ok(Vec::new());
        }
        let mut statement = self.index.prepare_cached(&format!(
            "SELECT {COLUMNS} FROM messages JOIN (SELECT id AS hit, rank AS score FROM message_text WHERE message_text MATCH ?1) AS found ON found.hit = messages.id \
             WHERE messages.shelf != 'trashed' ORDER BY found.score LIMIT ?2"
        ))?;
        let rows = statement.query_map(params![words.join(" "), i64::try_from(limit.min(SEARCH_LIMIT)).unwrap_or(0)], record_from_row)?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// Every rule, in the order they run.
    ///
    /// # Errors
    ///
    /// [`StoreError`] when the index cannot be read.
    pub fn rules(&self) -> Result<Vec<StoredRule>, StoreError> {
        let mut statement = self.index.prepare_cached("SELECT id, body FROM rules ORDER BY position, id")?;
        let rows = statement.query_map([], |row| Ok(StoredRule { id: row.get(0)?, body: row.get(1)? }))?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// Adds a rule at the end, or replaces the body of the rule with the same id where it stands.
    ///
    /// # Errors
    ///
    /// [`StoreError`] when the index cannot be written.
    pub fn save_rule(&self, rule: &StoredRule) -> Result<(), StoreError> {
        self.index.execute(
            "INSERT INTO rules (id, position, body) VALUES (?1, (SELECT COALESCE(MAX(position), 0) + 1 FROM rules), ?2) \
             ON CONFLICT (id) DO UPDATE SET body = excluded.body",
            params![rule.id, rule.body],
        )?;
        Ok(())
    }

    /// Deletes a rule. Returns false when there was none with that id.
    ///
    /// # Errors
    ///
    /// [`StoreError`] when the index cannot be written.
    pub fn delete_rule(&self, id: &str) -> Result<bool, StoreError> {
        Ok(self.index.execute("DELETE FROM rules WHERE id = ?1", [id])? == 1)
    }

    /// Every message id, newest first, for re-running rules over old mail.
    ///
    /// # Errors
    ///
    /// [`StoreError`] when the index cannot be read.
    pub fn all(&self) -> Result<Vec<MessageRecord>, StoreError> {
        let mut statement = self.index.prepare_cached(&format!("SELECT {COLUMNS} FROM messages ORDER BY sent_at DESC"))?;
        let rows = statement.query_map([], record_from_row)?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// Notes something a person, a rule or an agent changed.
    ///
    /// # Errors
    ///
    /// [`StoreError`] when the index cannot be written.
    pub fn log(&self, entry: &Activity) -> Result<(), StoreError> {
        self.index
            .execute("INSERT INTO activity (at, actor, action, detail) VALUES (?1, ?2, ?3, ?4)", params![entry.at, entry.actor, entry.action, entry.detail])?;
        Ok(())
    }

    /// The latest activity, newest first.
    ///
    /// # Errors
    ///
    /// [`StoreError`] when the index cannot be read.
    pub fn activity(&self, limit: usize) -> Result<Vec<Activity>, StoreError> {
        let mut statement = self.index.prepare_cached("SELECT at, actor, action, detail FROM activity ORDER BY at DESC, rowid DESC LIMIT ?1")?;
        let rows = statement.query_map([i64::try_from(limit).unwrap_or(0)], |row| {
            Ok(Activity { at: row.get(0)?, actor: row.get(1)?, action: row.get(2)?, detail: row.get(3)? })
        })?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    fn contains(&self, id: &str) -> Result<bool, StoreError> {
        Ok(self.index.query_row("SELECT 1 FROM messages WHERE id = ?1", [id], |_| Ok(())).optional()?.is_some())
    }
}

/// A `LIKE` pattern matching `query` anywhere, its own `%`, `_` and backslashes escaped (with `ESCAPE '\\'`).
fn like_pattern(query: &str) -> String {
    format!("%{}%", query.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_"))
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
        starred: row.get(13)?,
        shelf: Shelf::from_stored(&row.get::<_, String>(14)?),
        thread_id: row.get(15)?,
        snoozed_until: row.get(16)?,
        thread_size: row.get::<_, Option<u32>>(17)?.unwrap_or(1).max(1),
        tags: row.get::<_, Option<String>>(18)?.map(|joined| joined.split(TAG_SEPARATOR).map(str::to_owned).collect()).unwrap_or_default(),
        size: row.get(19)?,
        checks: row.get(20)?,
    })
}
