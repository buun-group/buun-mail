-- A mailbox owns domains and holds the mail sent to them until its app collects it.
CREATE TABLE IF NOT EXISTS mailboxes (
  id         TEXT PRIMARY KEY CHECK (id LIKE 'mbx_%'),
  name       TEXT NOT NULL,
  -- SHA-256 of the app token. The token itself is shown once, when the mailbox is made, and never stored.
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
) STRICT;

-- The domains a mailbox receives for, lower case. A domain belongs to one mailbox.
CREATE TABLE IF NOT EXISTS mailbox_domains (
  domain     TEXT PRIMARY KEY,
  mailbox_id TEXT NOT NULL REFERENCES mailboxes (id) ON DELETE CASCADE
) STRICT;

-- Mail waiting to be collected. The raw message is kept under `object_key`; the row is the queue.
CREATE TABLE IF NOT EXISTS messages (
  id            TEXT PRIMARY KEY CHECK (id LIKE 'mml_%'),
  mailbox_id    TEXT NOT NULL REFERENCES mailboxes (id) ON DELETE CASCADE,
  envelope_from TEXT NOT NULL,
  envelope_to   TEXT NOT NULL,
  size          INTEGER NOT NULL CHECK (size >= 0),
  object_key    TEXT NOT NULL,
  received_at   INTEGER NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS messages_by_mailbox ON messages (mailbox_id, received_at);
