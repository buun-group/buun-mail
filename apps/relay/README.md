# Relay

An Email Worker for a domain that lives in a different Cloudflare account from your gateway. Email Routing only hands a
zone's mail to a Worker in the same account, so this Worker sits in the domain's account, its catch-all points here, and
every message is posted on to the gateway (`apps/gateway`), which holds it for Buun Mail. The relay stores nothing. To
set one up, follow the relay section of [Self-hosting the mail gateway](../../docs/self-hosting.md).

## TL;DR

| Need | Do (from the repository root) |
|---|---|
| A relay key | `pnpm --filter @buun-mail/gateway mailbox add-relayed-domain <mbx_ id> other.example --env production`, then `mailbox add-relay <mbx_ id> --name other-account --env production` |
| Run it locally | Put a local key in `apps/relay/.dev.vars` (see `.dev.vars.example`), start the gateway, then `pnpm --filter @buun-mail/relay dev` (port 28621) |
| Send it a test email | `curl -X POST "http://localhost:28621/cdn-cgi/handler/email?from=a@b.example&to=hello@other.example" --data-binary @mail.eml` (the file needs a `Message-ID:`) |
| Test | `pnpm --filter @buun-mail/relay test` |
| First deploy | Set `GATEWAY_URL` in `wrangler.jsonc`, `pnpm --filter @buun-mail/relay exec wrangler secret put RELAY_KEY --env production`, then `pnpm --filter @buun-mail/relay deploy` |
| Update it | `pnpm --filter @buun-mail/relay upload` (a new version, no traffic yet), then `promote` |
| A preview relay | The same with `--env preview` and `deploy:preview`, pointed at a preview gateway with its own key |

## What happens to a message

| Gateway answers | Relay does |
|---|---|
| 2xx | Done |
| 4xx (not 401 or 429), such as a domain its mailbox does not own | Rejects, so the sender gets a bounce |
| 401 (wrong relay key), 429, 5xx, or no answer | Fails temporarily, so the sending server retries and no mail is lost |

## Standards

Code here follows:

| Standard | What it governs |
|---|---|
| [Wrangler config](../../.standards/docs/standards/packs/cloudflare/wrangler-config.md) and [environments](../../.standards/docs/standards/packs/cloudflare/environments.md) | Local, `preview` and `production`, `GATEWAY_URL` per environment |
| [Secrets](../../.standards/docs/standards/packs/cloudflare/secrets.md) | `RELAY_KEY` as a secret, `.dev.vars` locally |
| [Resilience](../../.standards/docs/standards/core/resilience.md) | A time limit on the call to the gateway, and a retry rather than a lost message |

## Contents

| Path | Purpose |
|---|---|
| `src/worker.ts` | The entry: the email handler, and a `fetch` that answers 404 |
| `src/relay.ts` | Hands one message to the gateway and decides between done, bounce and retry |
| `src/__tests__/relay.test.ts` | Each answer from the gateway |
| `wrangler.jsonc` | Local, preview and production; `GATEWAY_URL` per environment |
| `.dev.vars.example` | The relay key and what happens without it |
| `vitest.config.ts` | Tests run in Node with a fake `fetch` |
