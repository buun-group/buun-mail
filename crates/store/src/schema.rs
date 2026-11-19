//! The index's tables, created and moved forward with SQLite's `user_version`.

use rusqlite::Connection;

/// Each migration in order. Index `n` takes the database from version `n` to `n + 1`. Never edit one that has
/// shipped; add the next.
const MIGRATIONS: &[&str] = &["CREATE TABLE messages (
        id             TEXT PRIMARY KEY,
        workspace      TEXT NOT NULL,
        folder         TEXT,
        matched        TEXT,
        folder_matched TEXT,
        from_name      TEXT NOT NULL,
        from_address   TEXT NOT NULL,
        to_address     TEXT NOT NULL,
        subject        TEXT NOT NULL,
        preview        TEXT NOT NULL,
        sent_at        INTEGER NOT NULL,
        message_id     TEXT,
        unread         INTEGER NOT NULL DEFAULT 1
    ) STRICT;
    CREATE INDEX messages_by_folder ON messages (workspace, folder, sent_at DESC);"];

/// Brings the database up to the latest version, one migration at a time, each in its own transaction.
pub(crate) fn migrate(connection: &mut Connection) -> rusqlite::Result<()> {
    let current: u32 = connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    for (version, sql) in (0_u32..).zip(MIGRATIONS).skip_while(|(version, _)| *version < current) {
        let transaction = connection.transaction()?;
        transaction.execute_batch(sql)?;
        transaction.pragma_update(None, "user_version", version + 1)?;
        transaction.commit()?;
    }
    Ok(())
}
