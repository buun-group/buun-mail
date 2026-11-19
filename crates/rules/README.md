# Rules

Rules that run on mail as it arrives, after routing: when mail is in a workspace, from a sender, to an address or has
some text in its subject, tag it, move it, mark it read or keep it quiet. Pure data and pure functions, so a person in
Settings and an agent over MCP edit the same rules.

## Standards

Code here follows:
- [Type-driven design](../../.standards/docs/standards/core/type-driven-design.md) - a `Rule` as written, a `CheckedRule` ready to run
- [Error handling](../../.standards/docs/standards/core/error-handling.md) - `RuleError` says what to fix, for people and agents alike

## Contents

| Path | Purpose |
|---|---|
| `src/rule.rs` | `Rule`, `When`, `Action` (the JSON agents send) and `Rule::check` |
| `src/engine.rs` | `evaluate`: every enabled match runs in order; the last move wins |
| `src/error.rs` | `RuleError` |
