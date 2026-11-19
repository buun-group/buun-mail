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
| `agent/` | The MCP server agents connect to: `settings` (on, port, token in `agent.json`), `protocol`, `tools`, `server` (local only, token, no web origins), `state` |
| `lib.rs` | Builds the app: plugins, the mailbox as state, the commands |
| `sync/` | Collecting mail from the Buun Mail Gateway: `gateway` (HTTP client), `settings` (`gateway.json`), `service` (the 30-second loop, collect then acknowledge) |
| `paths.rs` | Where the routing file and the store live on this platform; writes the example routing file on first run |
| `ingest.rs` | Parse, route, run the rules on and store one message. Every mail source goes through it |
| `mailbox/` | What the UI and agents read and change: `read` (lists, search, activity), `change` (tags, moves, read state), `rules`, `import`; every change logged with who made it |
| `commands.rs` | The thin Tauri commands |
| `events.rs` | What the Rust side tells the UI unasked: `mail-arrived` |
| `dto.rs` | The shapes sent to the UI, mirrored in `ui/src/api/types.ts` |
| `error.rs` | `AppError`, sent to the UI as its message |
