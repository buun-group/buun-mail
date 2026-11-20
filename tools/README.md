# Tools

Developer scripts the root `package.json` calls.

## Contents

| Path | Purpose |
|---|---|
| `with-rustup.mjs` | Runs a command with rustup's proxies first on `PATH`, so `rust-toolchain.toml` picks the compiler even when a shell puts a fixed toolchain ahead of them |
