-- What adding a domain changed in Cloudflare, so removing it puts everything back. `previous_catch_all` is the zone's
-- catch-all rule (JSON) as it was before the gateway took it over, such as a forward to a personal mailbox.
ALTER TABLE mailbox_domains ADD COLUMN zone_id TEXT;
ALTER TABLE mailbox_domains ADD COLUMN previous_catch_all TEXT;
ALTER TABLE mailbox_domains ADD COLUMN added_at INTEGER;
