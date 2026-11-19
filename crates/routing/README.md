# Routing

Decides which workspace and folder a message belongs to, from its envelope sender and recipient and a TOML routing
file. Pure: no I/O, no async, so it runs the same in the desktop app and, later, in the Email Worker.

## Standards

Code here follows:
- [Type-driven design](../../.standards/docs/standards/core/type-driven-design.md) - newtypes for addresses, ids and folders
- [Error handling](../../.standards/docs/standards/core/error-handling.md) - one error enum per failure kind, each says what to fix
- [Constants](../../.standards/docs/standards/core/constants.md) - every literal named at the top of its module
- [Testing strategy](../../.standards/docs/standards/core/testing-strategy.md) - unit tests beside the code, behaviour tests in `tests/`

## Contents

| Path | Purpose |
|---|---|
| `src/lib.rs` | The public surface and a worked example |
| `src/address.rs` | `Address`: lower-cased `local@domain` with any `+tag` kept apart |
| `src/pattern.rs` | `Pattern`: an exact address or `*@domain`, with specificity |
| `src/config.rs` | The routing file as written (serde) |
| `src/router.rs` | `Router`: checks a file whole, then routes an `Envelope` to a `Route` |
| `src/error.rs` | `AddressError` and `ConfigError` |
| `tests/router.rs` | The router against a realistic routing file |
