# Desktop shell source

The Rust side of the app. Commands are thin reads; the mailbox holds the router and the placed messages.

## Standards

Code here follows:
- [Code organisation](../../../../.standards/docs/standards/core/code-organisation.md) - commands parse and answer, nothing more
- [Error handling](../../../../.standards/docs/standards/core/error-handling.md) - `LoadError` names the message or rule at fault

## Contents

| Path | Purpose |
|---|---|
| `main.rs` | The binary; calls `run` |
| `lib.rs` | Builds the app: opener plugin, the mailbox as state, the commands |
| `commands.rs` | `list_workspaces`, `list_messages` |
| `mailbox.rs` | Routes messages and answers the commands; a local store replaces its list later |
| `dto.rs` | The shapes sent to the UI, mirrored in `ui/src/api/types.ts` |
| `demo.rs` | The example routing file and demo messages, until the Worker sync exists |
