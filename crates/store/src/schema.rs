//! The index's tables, created and moved forward with SQLite's `user_version`.

use rusqlite::Connection;

/// Each migration in order. Index `n` takes the database from version `n` to `n + 1`. Never edit one that has
/// shipped; add the next.
const MIGRATIONS: &[&str] = &[
    "CREATE TABLE messages (
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
    CREATE INDEX messages_by_folder ON messages (workspace, folder, sent_at DESC);",
    "CREATE TABLE tags (
        message_id TEXT NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
        tag        TEXT NOT NULL,
        PRIMARY KEY (message_id, tag)
    ) STRICT;
    CREATE INDEX tags_by_tag ON tags (tag);
    CREATE TABLE rules (
        id       TEXT PRIMARY KEY,
        position INTEGER NOT NULL,
        body     TEXT NOT NULL
    ) STRICT;
    CREATE TABLE activity (
        at     INTEGER NOT NULL,
        actor  TEXT NOT NULL,
        action TEXT NOT NULL,
        detail TEXT NOT NULL
    ) STRICT;
    CREATE INDEX activity_by_time ON activity (at DESC);",
    "ALTER TABLE messages ADD COLUMN starred INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE messages ADD COLUMN shelf TEXT NOT NULL DEFAULT 'active' CHECK (shelf IN ('active', 'archived', 'trashed'));
    ALTER TABLE messages ADD COLUMN shelved_at INTEGER;
    CREATE INDEX messages_by_shelf ON messages (shelf, sent_at DESC);",
    "ALTER TABLE messages ADD COLUMN thread_id TEXT;
    CREATE INDEX messages_by_thread ON messages (thread_id, sent_at);
    CREATE INDEX messages_by_message_id ON messages (message_id);
    CREATE TABLE message_refs (
        message TEXT NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
        ref     TEXT NOT NULL,
        PRIMARY KEY (message, ref)
    ) STRICT;
    CREATE INDEX message_refs_by_ref ON message_refs (ref);
    CREATE VIRTUAL TABLE message_text USING fts5(id UNINDEXED, subject, people, body, tokenize = 'unicode61 remove_diacritics 2');",
];

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
