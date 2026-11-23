# CLAUDE.md

Buun Mail: a local desktop mail client (Rust, Tauri 2, React) that files mail from many business domains into
workspaces and folders by the envelope recipient, fed by Cloudflare Email Routing. [README](README.md) has the plan.

This repository follows the [Buun Group coding standards](./.standards/docs/standards/core/index.md), mounted at
`.standards`. The standards have no Rust pack yet; the Rust rules below stand in until one exists.

## Layout and boundaries

- `crates/*` are libraries. `routing` and `message` are pure: no I/O, no Tauri, no async. `store` owns the disk and
  nothing else. Anything that reads a socket or a clock lives in an app.
- Every mail source goes through `apps/desktop/src-tauri/src/ingest.rs` (parse, route, store), so a message is placed
  the same way whichever door it came through.
- `apps/desktop/src-tauri` is a thin shell: commands parse and answer, logic lives in `mailbox.rs` and the crates.
- `apps/desktop/ui` never decides where mail goes. It shows what the Rust side sends. `src/api/client.ts` is the only
  file that calls Tauri.
- `src-tauri/src/dto.rs` and `ui/src/api/types.ts` mirror each other. Change both together.
- Agents reach the mailbox only through `src-tauri/src/agent` (MCP). A new agent ability is a tool in `agent/tools.rs`
  calling a mailbox method, never SQL or file access of its own. Tool names are a contract: never rename one.
- Rules are JSON (`crates/rules`), the same shape for the UI and for agents. A rule's fields are `name`, `when` and
  `actions`.
- `apps/gateway` and `apps/relay` are the Cloudflare Workers people deploy to their own account
  ([docs/self-hosting.md](docs/self-hosting.md)). The gateway's `/v1` API is the contract with
  `src-tauri/src/sync/gateway.rs` and `sync/push.rs`: change both together, and never break a shipped app. A schema
  change is a new file in `apps/gateway/migrations`, never an edit to an old one.
- `packages/brand` is the only place the mark is drawn. The app imports `Mark`, `Splash` and the motion CSS from it; the
  desktop icons are generated from its `app-icon-1024.png` with `tauri icon`.

## Rust rules

- Workspace lints in the root `Cargo.toml`: clippy `all` denied, `pedantic` warned, `unwrap_used`, `panic`, `todo`,
  `dbg_macro` and `print_stdout` denied, `unsafe_code` forbidden. Warnings fail `pnpm check`.
- Errors are `thiserror` enums that say what to fix. No `Box<dyn Error>` in a library.
- Newtypes for ids (`WorkspaceId`, `FolderName`), constants named at the top of the module, never a bare literal in logic.
- Every public item has a doc comment. Tests sit beside the code (`mod tests`) and in `tests/` for whole-crate behaviour.
- Tests return `Result` or use `unreachable!` with a reason; never `unwrap`.

## Dependencies

- Exact versions only, in Rust (`=x.y.z` in `[workspace.dependencies]`) and npm (`saveExact`).
- Nothing younger than seven days: pnpm enforces `minimumReleaseAge`; for crates, check the publish date by hand.
- Fewer is better. Ask before adding one.

## UI rules

- The look is Buun Group's: tokens copied from `@buun-group/ui` into `ui/src/styles/tokens.css`, same names. Only that
  file writes a colour. Geist and Geist Mono, Latin subset only.
- Every word the UI shows comes from `ui/src/locales/en/*.json` through i18next (`useTranslation`, `t()`); never write
  copy in a component or a constant. Keys are type-checked; a new language follows `ui/src/i18n/README.md`.
- Every glyph comes from `ui/src/icons.ts` (Phosphor Light). Never import `react-icons` elsewhere.
- Buun Group products show in the sidebar footer and in the empty reader, from `ui/src/constants/products.ts`, in the
  words buungroup.com uses. A new product also needs its site in `src-tauri/capabilities/default.json`; a test fails
  otherwise.
- External links open in the browser through `openExternal`, never inside the app.

## Commands

`pnpm check` before you finish. `pnpm dev:ui` to work on the look without building Rust. `pnpm dev:brand` for the
brand preview, `pnpm brand:build` after changing the mark.

## Writing, commits

- No em dash anywhere. Plain words, short sentences.
- Conventional Commits. Commit only when the owner asks. The organisation does not allow an AI tool to be credited: no
  `Co-Authored-By` line naming one, no `Claude-Session` line, no "Generated with" line. `no-ai-coauthors.yml` fails a
  push that carries one.
- Never deploy, publish or set a secret unless the owner asks.
