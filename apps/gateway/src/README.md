# Gateway source

The Worker: an email handler that takes mail for the domains a mailbox owns, the HTTP API the app collects it with, a
daily clean-up, and a Durable Object per mailbox that tells apps when mail lands.

## Standards

Code here follows:

| Standard | What it governs |
|---|---|
| [Service layer](../../../.standards/docs/standards/packs/node-api/service-layer.md) | Routes parse and answer, services decide and query, the runtime is passed in |
| [Security](../../../.standards/docs/standards/core/security.md) | One refusal, one message, and a test for each |
| [Durable Objects](../../../.standards/docs/standards/packs/cloudflare/durable-objects.md) | The notifier, one per mailbox, on the hibernation API |
| [Vitest testing](../../../.standards/docs/standards/packs/vitest/testing.md) | Every route, refusal and the email handler, against SQLite and fakes |

## Contents

| Path | Purpose |
|---|---|
| `worker.ts` | The entry: `fetch`, `email`, `scheduled` (the daily clean-up) and the Durable Object export |
| `app.ts` | The HTTP app: the request id, the routes, `/openapi.json`, and the one error handler; `runtimeOf` builds the runtime per request, so tests hand in fakes |
| `email.ts` | The email handler: find the mailbox, refuse or store the message within its size limit, notify |
| `types.ts` | The slice of the Workers runtime the gateway uses, declared here so tests stand each one in with a small fake |
| `constants/` | Limits, retention, token shapes, refusal words. [Its README](constants/README.md) |
| `durable/` | `MailboxNotifier`. [Its README](durable/README.md) |
| `lib/` | The runtime, the bearer check, ids, hashing, Cloudflare and the raw mail store. [Its README](lib/README.md) |
| `routes/` | The `/v1` API. [Its README](routes/README.md) |
| `services/` | Mailboxes, messages, domains and relays, with their SQL. [Its README](services/README.md) |
| `__tests__/` | The harness (SQLite with the real migrations, a fake Cloudflare) and the tests |
