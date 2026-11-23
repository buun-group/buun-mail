-- The daily clean-up finds uncollected mail by age alone, across every mailbox. This index lets it seek instead of
-- scanning the whole queue, so an idle run reads nothing.
CREATE INDEX IF NOT EXISTS messages_by_age ON messages (received_at);
