# Tools

Developer scripts the root `package.json` calls.

## Contents

| Path | Purpose |
|---|---|
| `with-rustup.mjs` | Runs a command with rustup's proxies first on `PATH`, so `rust-toolchain.toml` picks the compiler even when a shell puts a fixed toolchain ahead of them |
| `next-version.mjs` | The next beta's version from the newest stable tag and the conventional commits since it, for `beta.yml` |
| `set-version.mjs` | `node tools/set-version.mjs <version>`: writes a version into `tauri.conf.json`, `package.json` and `Cargo.toml`, for a beta's build |
