# Gateway

The Buun Mail gateway: a Cloudflare Email Worker that receives mail for the domains a mailbox owns, holds it until the
Buun Mail app collects it, and tells connected apps the moment it lands. It has its own D1 database (mailboxes, domains
and the waiting mail), one Durable Object per mailbox for the push, and an optional R2 bucket for raw mail. To deploy
your own, follow [Self-hosting the mail gateway](../../docs/self-hosting.md).

## TL;DR

| Need | Do (from the repository root) |
|---|---|
| Run it locally | `pnpm --filter @buun-mail/gateway dev` (port 28620) |
| Make a local mailbox | `pnpm --filter @buun-mail/gateway mailbox create --name "Test"` (prints its token once) |
| Send it a test email | `curl -X POST "http://localhost:28620/cdn-cgi/handler/email?from=a@b.example&to=x@acme.example" --data-binary @mail.eml` (the file needs a `Message-ID:`, and the domain must be the mailbox's) |
| Test | `pnpm --filter @buun-mail/gateway test` |
| Check it bundles | `pnpm --filter @buun-mail/gateway check:deploy` |
| First deploy | `pnpm --filter @buun-mail/gateway db:migrate`, then `pnpm --filter @buun-mail/gateway deploy` |
| Update a running gateway | `db:migrate`, then `upload` (a new version, no traffic yet), check it, then `promote` |
| A preview gateway | The same with `db:migrate:preview` and `deploy:preview`, and `--env preview` on admin commands |
| Admin a deployed gateway | Add `--env production` (or `--env preview`) to any `mailbox` command (see `scripts/mailbox.ts`) |
| Read the API | `GET /openapi.json` on any gateway |

## API

Every `/v1` call needs `Authorization: Bearer <mailbox token>` (`bmg_...`), except the relay route, which takes a relay
key (`bmr_...`). The desktop client is `apps/desktop/src-tauri/src/sync/gateway.rs`; this API is its contract.

| Call | Does |
|---|---|
| `GET /v1/messages?limit=50` | Waiting mail, oldest first: `id`, `envelopeFrom`, `envelopeTo` (the exact recipient), `size`, `receivedAt` |
| `GET /v1/messages/:id/raw` | The message as `message/rfc822` |
| `POST /v1/messages/ack` `{ "ids": [...] }` | Forgets messages the app has stored; ids from another mailbox are ignored |
| `GET /v1/domains` | The mailbox's domains, each with `via`, `routedHere` (does Cloudflare's catch-all point here) and `previously` |
| `GET /v1/domains/available` | Zones in the gateway's Cloudflare account no mailbox owns, with what each catch-all does now |
| `POST /v1/domains` `{ "domain": "acme.example" }` | Claims a zone: turns Email Routing on if needed, keeps the old catch-all, points it here |
| `POST /v1/domains` `{ "domain": "other.example", "via": "relay" }` | Records a domain from another Cloudflare account, whose relay hands its mail over; nothing changes in Cloudflare |
| `DELETE /v1/domains/:domain` | Gives a zone back: restores the catch-all it had before |
| `POST /v1/relay/messages` | For a relay, with its key: the raw message as the body, `X-Envelope-From` and `X-Envelope-To` headers; taken only for a domain the relay's mailbox owns |
| `GET /v1/stream` (WebSocket) | Sends `{"type":"arrived","id":"mml_..."}` for each new message; answers `ping` with a pong |
| `GET /health` | `{"ok":true}`, no token, reads nothing |
| `GET /openapi.json` | The OpenAPI 3.1 document for every route above, no token, reads nothing |

Every refusal answers with one envelope, and every answer carries an `X-Request-Id` header (Cloudflare's ray id when
there is one) that matches the Worker's log line:

```json
{ "error": true, "errorCode": "conflict", "message": "That domain already belongs to a mailbox.", "requestId": "8f00aa11bb22cc33-SYD" }
```

| `errorCode` | Status | When |
|---|---|---|
| `auth.missing` | 401 | No valid mailbox token, or relay key on the relay route |
| `validation.failed` | 400 | The request failed its schema, or an envelope header is not an address |
| `not_found` | 404 | No such message, domain or route for this caller |
| `conflict` | 409 | A mailbox already owns the domain |
| `permission.denied` | 403 | A relay delivered for a domain its mailbox does not own |
| `payload.too_large` | 413 | The message is over 25 MiB |
| `upgrade_required` | 426 | `/v1/stream` asked for without a WebSocket |
| `upstream` | 502 | Cloudflare refused or failed a routing change |
| `gateway.not_configured` | 503 | The gateway has no Cloudflare token |
| `internal` | 500 | Anything unexpected; the cause is in the log, never in the answer |

Codes are part of the contract: one is never renamed or reused. The desktop app reads `message`; gateways deployed
before this envelope answered `{ "error": "<word>", "message": "..." }`, which the app reads the same way.

## Domains and Cloudflare

A mailbox may only claim a zone in the gateway's own Cloudflare account, and only one no other mailbox owns. Claiming
records the zone's current catch-all (for example a forward to a personal mailbox) before pointing it at this Worker;
giving it back restores exactly that. Local development reads Cloudflare but never changes it unless
`CLOUDFLARE_WRITES=on`, because a local claim would redirect a real domain's mail to a Worker that is not deployed.

Email Routing only hands a zone's mail to a Worker in the same account. A domain in another account reaches the gateway
through a relay ([`../relay`](../relay/README.md)), or through a second gateway deployed into that account. Buun Mail
can connect to several gateways and merges them.

## Environments and deploys

| Environment | Where | Database | Use |
|---|---|---|---|
| Local | `wrangler dev` on port 28620 | Local D1 in `.wrangler/state` | Building and testing; never changes Cloudflare unless `CLOUDFLARE_WRITES=on` |
| `preview` | `buun-mail-gateway-preview` | Its own D1, `buun-mail-gateway-preview` | Optional: try a change on a spare domain before production |
| `production` | `buun-mail-gateway` | `buun-mail-gateway` | Your real domains |

The first deploy of an environment is `deploy`, because it creates the Worker and its Durable Object. After that,
`upload` makes a new version that takes no traffic and prints its own URL to check, and `promote` sends traffic to it
(`wrangler versions deploy` asks which version and what share, so a canary is a percentage below 100). `wrangler
rollback --env production` goes back a version. Migrate before you upload: migrations only add, so the running version
keeps working against the new schema. A release that adds a Durable Object class says so in its notes and needs
`deploy` again.

## Dependencies

| Package | Why it is here |
|---|---|
| `hono` and `@hono/zod-openapi` | The HTTP router, every route declared with `createRoute`, and the OpenAPI document |
| `zod` | Every request, every Cloudflare answer and the stored catch-all parsed before use |
| `wrangler` | Local runtime, migrations, deploys, and the platform proxy the admin command uses locally |
| `tsx` | Runs the TypeScript admin command (`scripts/mailbox.ts`) without a build step |
| `vitest`, `@types/node` | Tests against Node's built-in SQLite, and Node's types for the scripts |

All are exact versions, older than seven days when added (pnpm enforces it).

## Standards

Code here follows:

| Standard | What it governs |
|---|---|
| [Wrangler config](../../.standards/docs/standards/packs/cloudflare/wrangler-config.md) and [bindings](../../.standards/docs/standards/packs/cloudflare/bindings.md) | `wrangler.jsonc`: a separate database per environment, bindings declared in each |
| [Secrets](../../.standards/docs/standards/packs/cloudflare/secrets.md) | The Cloudflare token as a secret, `.dev.vars` locally |
| [D1 read budget](../../.standards/docs/standards/packs/cloudflare/d1-read-budget.md) | `/health` reads nothing; the daily clean-up seeks an index and stops at a limit |
| [Node API](../../.standards/docs/standards/packs/node-api/index.md) | `@hono/zod-openapi` routes with their OpenAPI block, `ApiError` thrown by services, one error envelope |
| [Environments](../../.standards/docs/standards/packs/cloudflare/environments.md) and [deployments](../../.standards/docs/standards/packs/cloudflare/deployments.md) | Local, preview and production, each with its own database; versions uploaded before they take traffic |
| [Security](../../.standards/docs/standards/core/security.md) | Tokens and keys hashed at rest, bound parameters, one refusal one message |
| [Resilience](../../.standards/docs/standards/core/resilience.md) | A time limit on every Cloudflare call, its answers parsed before use |

## Contents

| Path | Purpose |
|---|---|
| `src/` | The Worker's source. [Its README](src/README.md) |
| `migrations/` | The D1 schema, applied in order by `wrangler d1 migrations apply` |
| `scripts/mailbox.ts` | Mailbox admin: create, list, rename, rotate-token, add-domain, remove-domain, add-relayed-domain, add-relay, relays, remove-relay |
| `scripts/lib/target.ts` | The local database (Wrangler's platform proxy) or the deployed one (D1 HTTP API), both with bound parameters |
| `wrangler.jsonc` | The Worker, its email and cron triggers, the `DB` database and the `NOTIFIER` Durable Object, for local, `preview` and `production` |
| `.dev.vars.example` | The local secrets the gateway reads and what each does |
| `vitest.config.ts` | Tests run in Node against SQLite with the real migrations |
