# Gateway sync

Collecting mail from Buun Mail Gateways (`apps/gateway`), event-driven: the app asks a gateway for mail only when
something says mail may be waiting, so an idle app costs its gateway almost nothing.

## Standards

Code here follows:

| Standard | What it governs |
|---|---|
| [Resilience](../../../../../.standards/docs/standards/core/resilience.md) | A time limit on every call, reconnecting with a growing wait, and a safety check for a lost note |
| [Error handling](../../../../../.standards/docs/standards/core/error-handling.md) | `GatewayError` says what to fix, in words for Settings |

The gateway's `/v1` API is a contract: change `gateway.rs` with `apps/gateway`, and never break a shipped app or an
older gateway.

## When the app collects

| Event | Why it is enough |
|---|---|
| An `arrived` note on the WebSocket | Normal delivery, within seconds |
| The WebSocket (re)connects | Mail that landed while it was down |
| The app starts | The same, for while it was closed |
| Check now | By hand |
| The safety check: hourly while every socket is up, every five minutes while one is down | A note the gateway could not send, or a network that blocks WebSockets |

A socket that looks open but is dead (a changed network, a sleeping laptop) is caught by the heartbeat: a ping with no
pong in 30 seconds counts as a drop, and the reconnect collects.

## Contents

| Path | Purpose |
|---|---|
| `mod.rs` | The module and what it exports |
| `gateway.rs` | The HTTP client for the gateway's `/v1` API, `collect` included |
| `push.rs` | The WebSocket to `/v1/stream`: arrival notes, up and down, the heartbeat |
| `collect.rs` | Taking in one gateway's waiting mail: the collect call (two requests when mail arrives, whatever the count), or list, fetch and acknowledge for an older gateway |
| `service.rs` | The loop and its timers, the listener per gateway, and what Settings shows |
| `settings.rs` | Every gateway's name, address and token, in `gateways.json` |
| `tests.rs` | The sync against a fake gateway over real HTTP, both paths |
