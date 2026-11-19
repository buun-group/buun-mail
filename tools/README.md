# Tools

Developer scripts the root `package.json` calls.

## Contents

| Path | Purpose |
|---|---|
| `with-rustup.mjs` | Runs a command with rustup's proxies first on `PATH`, so `rust-toolchain.toml` picks the compiler even when a shell puts a fixed toolchain ahead of them |
| `release.mjs` | `pnpm release <version>`: sets the version in `tauri.conf.json`, `package.json` and `Cargo.toml`, commits and tags; pushing the tag builds the installers |
