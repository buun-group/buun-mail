# CryptFlare panel

The Settings panel for CryptFlare: connect in the browser, choose where saves go, turn on saving agent identities, and
see what is waiting. The saving itself is the Rust side's ([`src-tauri/src/cryptflare/`](../../../../src-tauri/src/cryptflare/README.md)).

## Standards

Code here follows:

| Standard | What it governs |
|---|---|
| [React](../../../../../../.standards/docs/standards/packs/react/index.md) | One component a concern, state kept where it is used |
| [UI craft](../../../../../../.standards/docs/standards/packs/ui-craft/index.md) | Every word from `locales/en/integrations.json`, every glyph from `icons.ts` |
| [Security](../../../../../../.standards/docs/standards/core/security.md) | No token or saved value reaches the window |

## Contents

| Path | Purpose |
|---|---|
| `cryptflare-connect.tsx` | `CryptFlareConnect`: connect, where saves go (`Target`), the switch, Save them now, Try now, Disconnect |
