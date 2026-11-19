# Buun Mail

One local mail client for every address you run. Each business domain points its MX at Cloudflare Email Routing, one
catch-all Email Worker receives everything, and the client files each message into a **workspace** (a business, or
personal) and a **folder** by the address it was actually delivered to. No jumping between Gmail, Outlook and Proton.

```
acme.com, globex.io, ...  MX -> Cloudflare Email Routing
catch-all -> Email Worker -> envelope `to` (exact original address)
          -> routing file -> workspace + folder -> desktop client
```

The envelope recipient survives the hop, so placing a message is a table lookup, never a guess from headers.

## Status

| Step | State |
|---|---|
| Routing crate: address, patterns, workspaces, folders, "why is it here" | Done, tested |
| Desktop shell (Tauri 2) with the three-pane UI and Buun Group product spots | Done, demo data |
| Catch-all Email Worker storing mail for the client to pull | Next |
| Local store (SQLite, raw `.eml` on disk) and search | After |
| Reply and compose as the right address (Resend, SPF, DKIM, DMARC per domain) | After |
| IMAP pull for Gmail, Outlook and Proton Bridge | Last |

## Commands

| Command | Does |
|---|---|
| `pnpm install` | Installs the UI and the Tauri CLI |
| `pnpm dev` | The desktop app, UI hot-reloading on http://localhost:28600 |
| `pnpm dev:ui` | The UI alone in a browser, on a preview mailbox, no Rust build. Fastest way to tune the look |
| `pnpm check` | `cargo fmt --check`, oxlint, clippy (pedantic, warnings fail), `tsc`, vitest, `cargo test`. CI runs the same |
| `pnpm build` | A release bundle for this platform |

Linux needs the WebKitGTK libraries Tauri uses: `libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev`.

## Layout

| Path | What it is |
|---|---|
| [`crates/routing`](crates/routing/README.md) | Pure routing: which workspace and folder a message belongs to. No I/O |
| [`apps/desktop`](apps/desktop/README.md) | The Tauri app: Rust shell in `src-tauri`, React UI in `ui` |
| [`config/workspaces.example.toml`](config/workspaces.example.toml) | The routing file format, with comments |
| `.standards/` | The [Buun Group coding standards](https://github.com/buun-group/standards), a submodule |

## Routing file

```toml
[[workspace]]
id = "acme"            # stored with every message: never rename
name = "Acme"
match = ["*@acme.com", "acme@personal.example"]
folders = [{ name = "Receipts", from = "*@stripe.com" }]
```

An exact address beats its domain whatever the order. A `+tag` is ignored when matching. Two workspaces claiming one
pattern is an error, not a coin toss. Mail nobody claims lands in **Unsorted**.
