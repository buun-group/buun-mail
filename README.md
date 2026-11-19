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
| Desktop shell (Tauri 2) with the three-pane UI, settings, integrations and Buun Group products | Done |
| Local store (SQLite index, raw `.eml` on disk), `.eml` and `.mbox` import, read state | Done |
| Tags, rules (tag, move, mark read, quiet on arrival), activity log | Done |
| Notifications: header bell, toasts, desktop notifications, per-workspace mute | Done |
| Agent access: MCP server on 127.0.0.1, token, 15 tools, setup for Claude Code, Cursor, VS Code | Done |
| Buun Mail Gateway sync: collect mail from the gateway in buungroup-app (`apps/mail-gateway`), checked every 30 seconds | Done |
| Live push from the gateway over WebSocket, sealed messages at rest | Next |
| Search | After |
| Reply and compose as the right address (Resend, SPF, DKIM, DMARC per domain) | After |
| IMAP pull for Gmail, Outlook and Proton Bridge | Last |

## Commands

| Command | Does |
|---|---|
| `pnpm install` | Installs the UI and the Tauri CLI |
| `pnpm dev` | The desktop app, UI hot-reloading on http://localhost:28600 |
| `pnpm dev:ui` | The UI alone in a browser, on a preview mailbox, no Rust build. Fastest way to tune the look |
| `pnpm check` | `cargo fmt --check`, oxlint, clippy (pedantic, warnings fail), `tsc`, vitest, `cargo test`. CI runs the same |
| `pnpm build` | This machine's installers, into `target/release/bundle/` |
| `pnpm dev:brand` | The brand preview on http://localhost:28610 |
| `pnpm brand:build` | Rebuilds the brand kit from the mark's geometry |

Rust comes from `rust-toolchain.toml` (1.99) through rustup. Make sure `~/.cargo/bin` comes first on your `PATH`, or the
pin is ignored and an older compiler refuses the build.

Linux needs the WebKitGTK libraries Tauri uses: `libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev`.

## Releases

```
pnpm release 0.2.0      # sets the version everywhere, commits, tags v0.2.0
git push --follow-tags  # builds the installers
```

The tag builds installers for Linux x86_64 (`.deb`, `.rpm`, `.AppImage`), macOS Apple silicon and Intel (`.dmg`) and
Windows (`.msi`, setup `.exe`) into a **draft** GitHub release; publish the draft when it looks right.
[packaging/README.md](packaging/README.md) says which file to pick. Arch builds from `packaging/arch/PKGBUILD`.
Builds are unsigned until the Apple and Windows signing secrets are added, so macOS and Windows warn on first open.

## Layout

| Path | What it is |
|---|---|
| [`crates/routing`](crates/routing/README.md) | Pure routing: which workspace and folder a message belongs to. No I/O |
| [`crates/message`](crates/message/README.md) | Pure parsing: raw mail to what the app shows. No I/O |
| [`crates/store`](crates/store/README.md) | The local store: SQLite index, raw `.eml` files, tags, rules, activity log |
| [`crates/rules`](crates/rules/README.md) | Pure rules: when mail matches, tag, move, mark read or keep quiet |
| [`apps/desktop`](apps/desktop/README.md) | The Tauri app: Rust shell in `src-tauri`, React UI in `ui` |
| [`packages/brand`](packages/brand/README.md) | The brand kit: mark, lockups, icons, social card, motion |
| [`packaging`](packaging/README.md) | Arch PKGBUILD, the Linux desktop entry, which installer to pick |
| [`config/workspaces.example.toml`](config/workspaces.example.toml) | The routing file format, with comments |
| `.standards/` | The [Buun Group coding standards](https://github.com/buun-group/standards), a submodule |

## Mail gateway

Mail for your domains is received by the Buun Mail Gateway, a Cloudflare Email Worker in
`buungroup-app/apps/mail-gateway`, which holds it until this app collects it. In Settings, Integrations, Buun Mail
Gateway, paste the gateway's address and a mailbox token (`bmg_...`, from its `mailbox:create`). The app checks every
30 seconds (or on Check now), files each message by the exact address it was sent to, and acknowledges it so the
gateway forgets it. The address and token are kept in `gateway.json` in the config folder, readable by you only.

## Agents

Turn on Settings, Agents. The app then serves MCP at `http://127.0.0.1:28700/mcp` with a bearer token, and shows the
line to paste for Claude Code, Cursor, VS Code or any MCP client. Agents can list, search and read mail, tag, move and
mark it read, and add or remove rules; `wait_for_message` waits for something like a sign-up confirmation. Everything an
agent changes is logged under its name and shows in the window at once.

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
