<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/readme/hero-dark.svg">
  <img alt="Buun Mail: one inbox for every address you run" src=".github/assets/readme/hero-light.svg" width="880">
</picture>

<p>
  <a href="https://github.com/buun-group/buun-mail/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/buun-group/buun-mail?style=flat-square&color=f18707&label=release"></a>
  <a href="LICENSE"><img alt="GPL-3.0 licence" src="https://img.shields.io/badge/licence-GPL--3.0-16141c?style=flat-square"></a>
  <img alt="Linux, macOS and Windows" src="https://img.shields.io/badge/platforms-Linux%20%7C%20macOS%20%7C%20Windows-16141c?style=flat-square">
  <img alt="Rust 1.99" src="https://img.shields.io/badge/Rust-1.99-b45309?style=flat-square&logo=rust&logoColor=white">
  <img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-24c8db?style=flat-square&logo=tauri&logoColor=white">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-149eca?style=flat-square&logo=react&logoColor=white">
</p>

<p>
  <a href="#install"><b>Install</b></a>
  &nbsp;&nbsp;&nbsp;
  <a href="#features"><b>Features</b></a>
  &nbsp;&nbsp;&nbsp;
  <a href="#how-it-works"><b>How it works</b></a>
  &nbsp;&nbsp;&nbsp;
  <a href="#build-from-source"><b>Build from source</b></a>
  &nbsp;&nbsp;&nbsp;
  <a href="#more-from-buun-group"><b>More from Buun Group</b></a>
</p>

</div>

Buun Mail is a local desktop mail client for people who run more than one address: a few businesses, a side project,
a personal inbox. Every message is filed into a **workspace** and a **folder** by the exact address it was delivered
to, so you read everything in one window instead of jumping between Gmail, Outlook and Proton. Your mail stays on your
computer, as plain `.eml` files with a SQLite index beside them.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/readme/app-dark.png">
  <img alt="Buun Mail with three workspaces in the sidebar, a message list and an open conversation" src=".github/assets/readme/app-light.png" width="100%">
</picture>

## Install

Download the file for your system from the [latest release](https://github.com/buun-group/buun-mail/releases/latest).
Settings, General can check that page once a day and say when a newer version is out.

| System | File | Notes |
|---|---|---|
| Debian, Ubuntu, Mint, Pop!_OS | `Buun.Mail_<version>_amd64.deb` | `sudo apt install ./Buun.Mail_*.deb` |
| Fedora, RHEL, openSUSE | `Buun.Mail-<version>-1.x86_64.rpm` | `sudo dnf install ./Buun.Mail-*.rpm` |
| Any other Linux | `Buun.Mail_<version>_amd64.AppImage` | `chmod +x`, then run it |
| Arch, Manjaro, EndeavourOS | `packaging/arch/PKGBUILD` | `makepkg -si` builds and installs from source, or use the AppImage |
| Windows | `Buun.Mail_<version>_x64-setup.exe` or `.msi` | Unsigned for now: SmartScreen asks, choose More info, then Run anyway |
| macOS, Apple silicon | `Buun.Mail_<version>_aarch64.dmg` | Unsigned for now: right-click the app, then Open |
| macOS, Intel | `Buun.Mail_<version>_x64.dmg` | As above |
| Android | Google Play testing, or `Buun.Mail_<version>_android.apk` | Ask to join the testers; or allow installs from your browser and open the APK |
| iPhone, iPad | TestFlight | Ask for a TestFlight invite, then install TestFlight and accept it |

[packaging/README.md](packaging/README.md) has more on which file to pick, [docs/mobile.md](docs/mobile.md) how the
phone apps are built and published, and [CHANGELOG.md](CHANGELOG.md) what each release changed.

## Features

### Reading

| Feature | What it does |
|---|---|
| Conversations | Replies grouped into one thread |
| Search | Full text across every folder (SQLite FTS5) |
| HTML mail | In a sealed frame; remote images blocked until you allow them |
| Sender checks | SPF, DKIM and DMARC as the receiving server saw them |
| Attachments | Previews; documents open in your own app, programs never |
| Notes | A private note on any message |

### Organising

| Feature | What it does |
|---|---|
| Workspaces | Add, edit and delete in Settings or by right-clicking the sidebar |
| Rules | Tag, move, mark read or keep quiet on arrival, by sender, words or tags |
| Shelves | Archive, trash, stars, snooze, All mail |
| Many at once | Select several, right-click menus, quick actions |
| Contacts | Built from the mail you have |
| Export | `.eml`, JSON, CSV or text; import `.eml` and `.mbox` |

### Writing

| Feature | What it does |
|---|---|
| Compose | New, reply, reply all and forward with attachments |
| Sending | Through Resend or any SMTP server, from the address the mail went to |
| Safety net | Undo send, an outbox that retries, drafts |
| Later | Send later, and a reminder when nobody answers |
| Per workspace | A signature and a from address; templates |
| Unsubscribe | One click where the sender supports it, or block |

### Collecting

| Feature | What it does |
|---|---|
| Your domains | A Cloudflare Email Worker gateway pushes mail over a WebSocket, with a 30 second check behind it |
| IMAP | Gmail, iCloud, Fastmail and Zoho with app passwords, Proton Mail Bridge, any server; never marked read there |
| dissolve.email | Disposable inboxes as their own workspace after an OAuth sign-in, and on Pro and Business an agent identity (password and made-up person) with each new address |
| Alerts | Slack, Discord, ntfy, Telegram, SMS, email or a webhook when a rule matches |
| Digests | A daily summary of what arrived |
| Notifications | Header bell, toasts, desktop notifications, mute per workspace |

### Agents

| Feature | What it does |
|---|---|
| MCP server | `http://127.0.0.1:28700/mcp`, off until you turn it on |
| Access | A bearer token you can regenerate |
| 15 tools | List, search and read mail, tag, move, mark read, manage rules |
| Waiting | `wait_for_message` waits for a sign-up confirmation |
| Setup | One line for Claude Code, Cursor, VS Code or any MCP client |
| Audit | Every change logged under the agent's name |

### Security

| Feature | What it does |
|---|---|
| Local first | Your mail is stored on your computer, nowhere else |
| Sealed secrets | API keys and passwords encrypted at rest under a per-install key |
| Reveal code | Asked before a stored secret is shown again |
| Backup | The whole mailbox and settings in one passphrase-sealed file |
| Strict window | A tight content security policy; links open in your browser |
| Updates | Asks only GitHub's release list, once a day, and you can turn it off |


<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/readme/workspaces-dark.png">
  <img alt="Editing a workspace in Settings: its name, the addresses it owns and its folders" src=".github/assets/readme/workspaces-dark.png" width="100%">
</picture>

## How it works

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/readme/routing-dark.svg">
  <img alt="Messages to five addresses flowing through the routing file into the Acme, Globex, Personal and Unsorted workspaces" src=".github/assets/readme/routing-light.svg" width="880">
</picture>

Point a domain's MX records at Cloudflare Email Routing and send its catch-all to a mail gateway, a small Cloudflare
Email Worker that holds each message until the app collects it. The envelope recipient survives that hop, so placing a
message is a table lookup on the address it was really sent to, never a guess from headers. IMAP mailboxes and
dissolve.email inboxes go through the same router.

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/readme/how-it-works-dark.svg">
  <img alt="Your domains reach a mail gateway in your Cloudflare account, which pushes to the router in the desktop app; IMAP mailboxes and dissolve.email go to the router too; the router files mail into the local store, which the app and MCP agents read" src=".github/assets/readme/how-it-works-light.svg" width="640">
</picture>
</div>

| Source | How mail arrives | Set up in |
|---|---|---|
| Your own domains | Cloudflare Email Routing, catch-all to a gateway Worker, pushed to the app the moment it lands | Settings, Integrations, Buun Mail Gateway |
| IMAP mailboxes | Collected on a timer or on Check now, left unread on the server | Settings, Integrations, IMAP |
| dissolve.email | Your disposable inboxes, synced after an OAuth sign-in | Settings, Integrations, dissolve.email |
| Files | `.eml` and `.mbox` imports | Settings, General |

The gateway's source is not published yet; until it is, IMAP and dissolve.email work without it. Several gateways can
feed one app, and the app can list, add and remove the domains each gateway receives for.

## Workspaces and the routing file

Workspaces live in a routing file, `workspaces.toml` in the app's config folder. You rarely need to open it: Settings,
Workspaces adds, changes and deletes them, and right-clicking a workspace in the sidebar does the same. The file is
edited in place, so your comments stay, and a change that would not load is refused with the reason.

```toml
[[workspace]]
id = "acme"            # stored with every message: never rename
name = "Acme"
icon = "briefcase"
match = ["*@acme.example", "accounts@personal.example"]
folders = [{ name = "Receipts", from = "*@stripe.com", icon = "receipt" }]
```

| Rule | What it means |
|---|---|
| An exact address beats its domain | `accounts@personal.example` lands in Acme even if another workspace owns `*@personal.example` |
| `+tags` are ignored | `me+shop@personal.example` matches `me@personal.example` |
| One home per address | Two workspaces claiming one pattern is an error, not a coin toss |
| Folders pick by sender | First match wins; everything else stays in the inbox |
| Nothing is lost | Mail nobody claims lands in **Unsorted**; a new address files the Unsorted mail it claims |
| Deleting is safe | A deleted workspace's mail moves to whichever workspace now claims it, or Unsorted |

A fresh install starts with one example workspace, Personal. [config/workspaces.example.toml](config/workspaces.example.toml)
lists every field and icon.

## Built with

| | Technology | Where it runs | What it does here |
|:---:|---|---|---|
| <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/readme/tech/rust-dark.svg"><img alt="" src=".github/assets/readme/tech/rust-light.svg" height="20"></picture> | **Rust** 1.99, edition 2024 | `crates/*`, `apps/desktop/src-tauri` | Parsing, routing, rules, the store, every mail source, the MCP server |
| <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/readme/tech/tauri-dark.svg"><img alt="" src=".github/assets/readme/tech/tauri-light.svg" height="20"></picture> | **Tauri** 2 | `apps/desktop/src-tauri` | The native window and installers, on the system's own web view |
| <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/readme/tech/react-dark.svg"><img alt="" src=".github/assets/readme/tech/react-light.svg" height="20"></picture> | **React** 19 | `apps/desktop/ui` | The interface |
| <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/readme/tech/typescript-dark.svg"><img alt="" src=".github/assets/readme/tech/typescript-light.svg" height="20"></picture> | **TypeScript** 7 | `apps/desktop/ui` | Every line of the interface, strict |
| <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/readme/tech/sqlite-dark.svg"><img alt="" src=".github/assets/readme/tech/sqlite-light.svg" height="20"></picture> | **SQLite** with FTS5 | `crates/store` | The message index and full-text search, built into the app (no server) |
| <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/readme/tech/vite-dark.svg"><img alt="" src=".github/assets/readme/tech/vite-light.svg" height="20"></picture> | **Vite** 8 | `apps/desktop/ui` | Builds the interface, and runs it alone in a browser with `pnpm dev:ui` |
| <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/readme/tech/vitest-dark.svg"><img alt="" src=".github/assets/readme/tech/vitest-light.svg" height="20"></picture> | **Vitest** 5 | `apps/desktop/ui` | The interface tests, beside more than 140 Rust tests |

### Why Rust

A mail client spends its day parsing text that strangers on the internet wrote, so the code that reads it should not be
able to corrupt memory. Rust gives that by construction, and this workspace goes further: `unsafe` code is forbidden in
every crate and clippy runs at pedantic with warnings as errors. The result is one native binary with no runtime to
install, that starts quickly and stays small in memory.

The logic lives in plain crates that know nothing about the window: `routing` and `message` do no I/O at all, `rules`
is pure, and `store` is tested against a real folder. Each is tested on its own, so the interface can change without
touching how mail is filed. Tauri then wraps it with the web view the system already has instead of shipping a browser:
the Linux `.deb` is about 7 MB and the Windows setup about 5 MB, where an Electron app carries its own Chromium and
usually passes 100 MB. (The AppImage is larger, about 80 MB, because it bundles WebKitGTK for distributions that lack
it.)

## Build from source

You need Node 22 or newer with pnpm, and Rust through rustup (the pinned 1.99 comes from `rust-toolchain.toml`; keep
`~/.cargo/bin` first on your `PATH` or an older compiler refuses the build). Linux also needs the WebKitGTK libraries
Tauri uses:

```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev   # Debian and Ubuntu
pnpm install
pnpm dev        # the desktop app, UI hot-reloading on http://localhost:28600
pnpm build      # this machine's installers, into target/release/bundle/
```

| Command | Does |
|---|---|
| `pnpm install` | Installs the UI and the Tauri CLI |
| `pnpm dev` | The desktop app, UI hot-reloading on http://localhost:28600 |
| `pnpm dev:ui` | The UI alone in a browser on a preview mailbox, no Rust build; the fastest way to tune the look |
| `pnpm check` | `cargo fmt --check`, oxlint, clippy (pedantic, warnings fail), `tsc`, vitest, `cargo test`; CI runs the same |
| `pnpm build` | This machine's installers, into `target/release/bundle/` |
| `pnpm dev:android`, `pnpm build:android` | The Android app on a phone or emulator, or its release `.aab` and `.apk` ([docs/mobile.md](docs/mobile.md)) |
| `pnpm dev:ios`, `pnpm build:ios` | The same for iOS, on a Mac with Xcode 26 |
| `pnpm dev:brand` | The brand preview on http://localhost:28610 |
| `pnpm brand:build` | Rebuilds the brand kit from the mark's geometry |

### Layout

| Path | What it is |
|---|---|
| [`crates/routing`](crates/routing/README.md) | Pure routing: which workspace and folder a message belongs to. No I/O |
| [`crates/message`](crates/message/README.md) | Pure parsing: raw mail to what the app shows. No I/O |
| [`crates/store`](crates/store/README.md) | The local store: SQLite index, raw `.eml` files, tags, rules, activity log |
| [`crates/rules`](crates/rules/README.md) | Pure rules: when mail matches, tag, move, mark read or keep quiet |
| [`apps/desktop`](apps/desktop/README.md) | The Tauri app: Rust shell in `src-tauri`, React UI in `ui` |
| [`packages/brand`](packages/brand/README.md) | The brand kit: mark, lockups, icons, social card, motion |
| [`packaging`](packaging/README.md) | Arch PKGBUILD, the Linux desktop entry, which installer to pick |
| [`docs/mobile.md`](docs/mobile.md) | The Android and iOS apps: building them, the store pipeline, its secrets and one-time set-up |
| [`config/workspaces.example.toml`](config/workspaces.example.toml) | The routing file a fresh install starts from, with comments |
| `.github/assets/readme` | The pictures on this page; `how-it-works.diagram` is the diagram's [Plotwork](https://plotwork.dev) source |

## Releases

| Branch | What happens there |
|---|---|
| `feature/...` | Your work. Open a pull request into `dev`; CI must pass before it merges. |
| `dev` | Every merge that carries a `feat`, `fix` or `perf` publishes a **beta** pre-release, such as `v0.6.0-beta.2`, with installers for every system. |
| `main` | `dev` merges here (with a merge commit). That updates the release pull request; merging it publishes the **stable** release. |

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org): a `feat` raises the minor version
while Buun Mail is below 1.0, a `fix` the patch. On `main`, [release-please](https://github.com/googleapis/release-please)
keeps one release pull request with the next version and [CHANGELOG.md](CHANGELOG.md); merging it tags a draft release,
GitHub Actions builds Linux (`.deb`, `.rpm`, `.AppImage`), macOS (Apple silicon and Intel `.dmg`) and Windows (`.msi`,
setup `.exe`) into it, and publishes it once every build has passed.

Betas are built the same way from `dev` but never committed: the version is stamped in for the build, so `main` only
ever holds stable versions. They skip `.rpm` and `.msi`, which do not accept a pre-release version, are never marked as
the latest release, and are never offered by the app's update check. Someone running a beta is told once the stable
version ships. To build an existing release again, run Actions, Release, Run workflow with its tag.

Once a release is out, the phone apps follow when something they are built from changed: a beta goes to Google Play
internal and closed testing and to TestFlight, a stable release to Play open testing and TestFlight, and the release
carries a signed Android APK. [docs/mobile.md](docs/mobile.md) has the pipeline and its one-time set-up.

A watchdog workflow re-runs a failed CI, Beta or Release run on `main` or `dev` once, opens an issue labelled
`ci-failure` when it fails again, and closes that issue when the workflow passes.

## Next

| Coming | Waiting on |
|---|---|
| Outlook.com sign-in | A Microsoft app registration |
| Passkey or system unlock for the reveal code | Platform work on each system |
| Signed macOS and Windows builds | Apple and Windows signing certificates |

## More from Buun Group

Buun Mail is made by [Buun Group](https://buungroup.com). The app's sidebar links to these too; none of them is needed
to use it.

<table>
<tr>
<td align="center" width="16%"><a href="https://buungroup.com"><picture><source media="(prefers-color-scheme: dark)" srcset="apps/desktop/ui/public/buun-group-dark.svg"><img alt="Buun Group" src="apps/desktop/ui/public/buun-group.svg" height="40"></picture><br><b>Buun Group</b></a><br><sub>The studio</sub></td>
<td align="center" width="16%"><a href="https://plotwork.dev"><img alt="Plotwork" src="apps/desktop/ui/public/products/plotwork.svg" height="40"><br><b>Plotwork</b></a><br><sub>Diagrams as code</sub></td>
<td align="center" width="16%"><a href="https://flung.dev"><picture><source media="(prefers-color-scheme: dark)" srcset="apps/desktop/ui/public/products/flung-dark.svg"><img alt="Flung" src="apps/desktop/ui/public/products/flung.svg" height="40"></picture><br><b>Flung</b></a><br><sub>Social publishing API</sub></td>
<td align="center" width="16%"><a href="https://gunspec.io"><picture><source media="(prefers-color-scheme: dark)" srcset="apps/desktop/ui/public/products/gunspec-dark.png"><img alt="GunSpec" src="apps/desktop/ui/public/products/gunspec.png" height="40"></picture><br><b>GunSpec</b></a><br><sub>Firearm data API</sub></td>
<td align="center" width="16%"><a href="https://dissolve.email"><picture><source media="(prefers-color-scheme: dark)" srcset="apps/desktop/ui/public/products/dissolve-dark.svg"><img alt="dissolve.email" src="apps/desktop/ui/public/products/dissolve.svg" height="40"></picture><br><b>dissolve.email</b></a><br><sub>Disposable email</sub></td>
<td align="center" width="16%"><a href="https://cryptflare.com"><picture><source media="(prefers-color-scheme: dark)" srcset="apps/desktop/ui/public/products/cryptflare-dark.png"><img alt="CryptFlare" src="apps/desktop/ui/public/products/cryptflare.png" height="40"></picture><br><b>CryptFlare</b></a><br><sub>Secrets management</sub></td>
</tr>
</table>

| Product | What it does |
|---|---|
| [Plotwork](https://plotwork.dev) | Write a diagram in a few lines of text; Plotwork draws it, checks it in CI and tells you when it drifts. The diagram above is one |
| [Flung](https://flung.dev) | Schedule and publish posts to 27 social networks through one REST API, an SDK or an MCP server |
| [GunSpec](https://gunspec.io) | Specifications for more than 8,500 firearms, with calibers, ammunition and fitment, every figure sourced |
| [dissolve.email](https://dissolve.email) | A disposable address in one click, in the browser, the extension or the API; Buun Mail shows its inboxes as a workspace |
| [CryptFlare](https://cryptflare.com) | Encrypted, versioned secrets with fine-grained access for teams, built on Cloudflare |

<div align="center">
<br>
<a href="https://buungroup.com"><picture><source media="(prefers-color-scheme: dark)" srcset="packages/brand/src/svg/mark-on-dark.svg"><img alt="Buun Mail" src="packages/brand/src/svg/mark-on-light.svg" width="40"></picture></a>
<br>
<sub>Made by <a href="https://buungroup.com">Buun Group</a>. The code follows the <a href="https://github.com/buun-group/standards">Buun Group coding standards</a>.</sub>
</div>

## Licence

Buun Mail is free software under the [GNU General Public License v3.0](LICENSE): use it, study it, change it and
share it. A changed version you distribute must be shared under the same licence, with its source.
