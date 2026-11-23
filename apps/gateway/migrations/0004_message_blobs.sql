-- Raw messages live in D1, split into parts, unless the Worker has an R2 bucket bound as MAIL: R2 needs a payment
-- method on the account, and mail is deleted once the app collects it, so the space used stays small. A message is
-- its parts in order.
CREATE TABLE IF NOT EXISTS message_parts (
  object_key TEXT NOT NULL,
  part       INTEGER NOT NULL CHECK (part >= 0),
  data       BLOB NOT NULL,
  PRIMARY KEY (object_key, part)
) STRICT;
