# Desktop

The Buun Mail desktop app: a Tauri 2 shell in Rust and a React UI. One deployable.

## Standards

Code here follows:
- [Code organisation](../../.standards/docs/standards/core/code-organisation.md) - thin commands, logic in the mailbox and the crates
- [React](../../.standards/docs/standards/packs/react/index.md) and [Vite](../../.standards/docs/standards/packs/vite/index.md) - the UI
- [UI design system](../../.standards/docs/standards/packs/ui-design-system/index.md) - Buun Group tokens, one icon registry
- [Security](../../.standards/docs/standards/core/security.md) - a strict CSP, and the opener allowed only the product sites

## Contents

| Path | Purpose |
|---|---|
| `src-tauri/` | The Rust shell: window, commands, the in-memory mailbox |
| `src-tauri/capabilities/default.json` | What the window may do: core events, and open only the Buun Group sites |
| `src-tauri/tauri.conf.json` | Window, CSP, dev port 28600, bundle |
| `ui/` | The React UI, built by Vite into `ui/dist` |
