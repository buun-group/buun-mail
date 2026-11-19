# Store

The local store: every message on this computer. A SQLite index (`index.sqlite`) holds what the list needs and where
routing put each message; the original bytes sit beside it as `.eml` files under `raw/`, named by content id. The
store knows nothing about parsing or routing.

## Standards

Code here follows:
- [Error handling](../../../../.standards/docs/standards/core/error-handling.md) - `StoreError` separates the index, the files and a missing id
- [Resilience](../../../../.standards/docs/standards/core/resilience.md) - a raw file is written through a rename before its row, so a row never points at nothing
- [Testing strategy](../../../../.standards/docs/standards/core/testing-strategy.md) - `tests/store.rs` runs against a real folder

## Contents

| Path | Purpose |
|---|---|
| `src/store.rs` | `Store`: open, insert (once per id), list, get, raw, unread counts, mark read |
| `src/record.rs` | `MessageRecord`, `Placement` and `UnreadCount` |
| `src/schema.rs` | Migrations, moved forward with SQLite's `user_version`; never edit one that shipped |
| `src/raw.rs` | Raw files on disk, sharded by the first two characters of the id |
| `src/error.rs` | `StoreError` |
| `tests/store.rs` | The store against a temporary folder |
