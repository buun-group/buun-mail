# Gateway services

The logic and the SQL, every query literal and bound. Each takes the `Runtime`; none touches Hono.

## Standards

Code here follows:

| Standard | What it governs |
|---|---|
| [Service layer](../../../../.standards/docs/standards/packs/node-api/service-layer.md) | Services hold the logic and the queries |
| [Drizzle queries](../../../../.standards/docs/standards/packs/drizzle/queries.md) | No query in a loop, bound parameters, every list with a limit (plain D1 here, the same rules) |
| [D1 read budget](../../../../.standards/docs/standards/packs/cloudflare/d1-read-budget.md) | The daily clean-up seeks `messages_by_age` and works in bounded rounds |

## Contents

| Path | Purpose |
|---|---|
| `mailboxes.ts` | Making a mailbox, finding one by its token's hash or by an address on one of its domains, listing, renaming, and a new token |
| `messages.ts` | Receiving a message, listing waiting mail, reading its raw bytes, acknowledging, and the daily clean-up |
| `domains.ts` | Claiming a zone (keeping its old catch-all and pointing it here), recording a relayed domain, giving one back, and whether each really routes here |
| `relays.ts` | Relay keys: making one, finding a relay by its key, listing and removing them, and whether the relay's mailbox owns an address |
