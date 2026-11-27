# UI API

The window's only door to the Rust side: every Tauri call goes through `client.ts`, which falls back to an in-memory
preview when there is no Rust side (`pnpm dev:ui`, tests).

## Standards

Code here follows:

| Standard | What it governs |
|---|---|
| [Code organisation](../../../../../.standards/docs/standards/core/code-organisation.md) | One file calls Tauri; the shapes mirror `src-tauri/src/dto.rs` and each service's DTOs |
| [Security](../../../../../.standards/docs/standards/core/security.md) | No token or secret value ever reaches the window |

## Contents

| Path | Purpose |
|---|---|
| `client.ts` | Every call to the Rust side, with its preview stand-in |
| `commands.ts` | The Tauri command names |
| `types.ts` | The shapes the Rust side sends, mirrored from its DTOs |
| `events.ts` | What the Rust side tells the window unasked |
| `notify.ts` | System notifications |
| `window.ts` | The window's own controls |
| `preview.ts` | The stand-in mailbox and services for the browser preview |
| `preview-cryptflare.ts` | CryptFlare's stand-in for the browser preview |
