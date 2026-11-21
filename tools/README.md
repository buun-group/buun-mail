# Tools

Developer scripts the root `package.json` calls.

## Contents

| Path | Purpose |
|---|---|
| `with-rustup.mjs` | Runs a command with rustup's proxies first on `PATH`, so `rust-toolchain.toml` picks the compiler even when a shell puts a fixed toolchain ahead of them |
| `next-version.mjs` | The next beta's version from the newest stable tag and the conventional commits since it, for `beta.yml` |
| `set-version.mjs` | `node tools/set-version.mjs <version>`: writes a version into `tauri.conf.json`, `package.json` and `Cargo.toml`, for a beta's build |
| `mobile-version.mjs` | `node tools/mobile-version.mjs <android\|ios> <tag>`: the version name, code and build number a phone build carries, as Tauri `--config` JSON |
| `mobile-impact.mjs` | Whether a release changed what a phone app is built from, since the `android-beta`, `ios-beta`, `android-stable` or `ios-stable` tag |
| `play-ship.mjs` | Uploads an `.aab` to a Google Play track, or promotes the release on one track to another; `play-versions.mjs` holds its pure parts |
| `apple-preflight.mjs` | The read-only App Store Connect check `mobile-ios.yml` runs first; `apple-checks.mjs` holds its pure parts |
