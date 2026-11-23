-- A relay is a small Email Worker in another Cloudflare account that hands its domain's mail to this gateway. It
-- belongs to one mailbox and may only deliver mail for that mailbox's domains. The key is stored as its SHA-256.
CREATE TABLE IF NOT EXISTS relays (
  id         TEXT PRIMARY KEY CHECK (id LIKE 'rly_%'),
  mailbox_id TEXT NOT NULL REFERENCES mailboxes (id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  key_hash   TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
) STRICT;

-- How a domain's mail reaches the gateway: `catch_all` (this account's Email Routing points here) or `relay`.
ALTER TABLE mailbox_domains ADD COLUMN via TEXT NOT NULL DEFAULT 'catch_all' CHECK (via IN ('catch_all', 'relay'));
