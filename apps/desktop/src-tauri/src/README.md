# Desktop shell source

The Rust side of the app. Commands are thin; the mailbox sits on the routing file and the local store, and every message comes in through `ingest`.

## Standards

Code here follows:
- [Code organisation](../../../../.standards/docs/standards/core/code-organisation.md) - commands parse and answer, nothing more
- [Error handling](../../../../.standards/docs/standards/core/error-handling.md) - `LoadError` names the message or rule at fault

## Contents

| Path | Purpose |
|---|---|
| `main.rs` | The binary; calls `run` |
| `lib.rs` | Builds the app: plugins, the mailbox as state, the commands |
| `paths.rs` | Where the routing file and the store live on this platform; writes the example routing file on first run |
| `ingest.rs` | Parse, route and store one message. Every mail source goes through it |
| `mailbox.rs` | What the UI reads and changes: workspaces with counts, messages, open, mark read, import |
| `commands.rs` | The thin Tauri commands |
| `dto.rs` | The shapes sent to the UI, mirrored in `ui/src/api/types.ts` |
| `error.rs` | `AppError`, sent to the UI as its message |
