# Message

Reads raw mail into the parts Buun Mail shows: sender, the address it was delivered to, subject, date, a preview and
the readable text. Pure: bytes in, values out, no files and no clock, so every mail source shares it.

## Standards

Code here follows:
- [Type-driven design](../../../../.standards/docs/standards/core/type-driven-design.md) - one `Parsed` value per message, addresses lower case
- [Error handling](../../../../.standards/docs/standards/core/error-handling.md) - `MessageError` says what the message is missing
- [Testing strategy](../../../../.standards/docs/standards/core/testing-strategy.md) - each module tests its own rules

## Contents

| Path | Purpose |
|---|---|
| `src/lib.rs` | The public surface and an example |
| `src/parse.rs` | `parse` (summary for the list) and `body_text` (text for the reader) |
| `src/recipient.rs` | Who a message was delivered to when no envelope came with it: Delivered-To, X-Original-To, Envelope-To, then To |
| `src/mbox.rs` | `is_mbox` and `split_mbox` for `.mbox` exports |
| `src/id.rs` | `content_id`: SHA-256 of the bytes, so a message is stored once |
| `src/time.rs` | `rfc3339` for the UI |
| `src/error.rs` | `MessageError` |
