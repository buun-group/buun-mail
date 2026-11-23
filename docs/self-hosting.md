# Self-hosting the mail gateway

How to run your own Buun Mail gateway on your Cloudflare account, so mail to your own domains reaches the Buun Mail
app with its exact recipient. It is for anyone setting up Buun Mail for their domains; it assumes a Cloudflare account
and a terminal, and nothing else.

## TL;DR

| Step | Command or place | Section |
|---|---|---|
| Get the code and sign in to Cloudflare | `pnpm install`, `wrangler login` | [1](#1-before-you-start) |
| Make the database | `wrangler d1 create buun-mail-gateway`, then paste its id | [2](#2-make-the-database) |
| Give the gateway its Cloudflare token | `wrangler secret put` twice | [3](#3-give-the-gateway-a-cloudflare-token) |
| Deploy | `pnpm --filter @buun-mail/gateway deploy` | [4](#4-deploy-the-gateway) |
| Make a mailbox and copy its token | `mailbox create --env production` | [5](#5-make-a-mailbox) |
| Connect the app and add your domains | Settings, Integrations, Buun Mail Gateway | [6](#6-connect-buun-mail-and-add-domains) |
| A domain in another Cloudflare account | Deploy the relay there | [7](#7-a-domain-in-another-cloudflare-account) |

## How it fits together

Each domain's MX records point at Cloudflare Email Routing. Its catch-all rule sends every message to the gateway, an
Email Worker in your account. The gateway keeps the message in D1 (Cloudflare's SQLite database) with the address it
was really sent to, and tells the app over a WebSocket. The app collects the message, files it by that address, and
tells the gateway to forget it. Mail nobody collects is deleted after 30 days.

| Part | Lives in | Code |
|---|---|---|
| Gateway Worker | Your Cloudflare account | [`apps/gateway`](../apps/gateway/README.md) |
| Relay Worker (only for a domain in a second account) | That other account | [`apps/relay`](../apps/relay/README.md) |
| Buun Mail | Your computer | `apps/desktop` |

Everything runs on Cloudflare's free plan: Workers, Email Routing, D1 and SQLite Durable Objects. Email Routing takes
messages up to 25 MiB, and so does the gateway.

## 1. Before you start

You need:

| Need | Why |
|---|---|
| A Cloudflare account | The gateway runs there |
| Each domain added to that account, with Cloudflare as its DNS | Email Routing only works on a zone Cloudflare serves |
| Node 22 or newer and pnpm 10 (`corepack enable` gives you the right pnpm) | To build and deploy |
| This repository | `git clone`, then `pnpm install` at its root |

Run every command below from the repository root. Sign Wrangler (Cloudflare's command line) in to your account once:

```sh
pnpm install
pnpm --filter @buun-mail/gateway exec wrangler login
```

If a domain does not use Email Routing yet, turn it on now in the Cloudflare dashboard: the domain, then **Email**,
**Email Routing**, **Get started**. Cloudflare adds the MX and SPF records it needs. Leave the catch-all as it is; the
gateway changes it later and puts it back when you remove the domain.

> Mail to a domain stops reaching its old provider once its MX records point at Cloudflare. If the domain already
> receives mail elsewhere (Google Workspace, Microsoft 365), moving it here moves all of it.

## 2. Make the database

```sh
pnpm --filter @buun-mail/gateway exec wrangler d1 create buun-mail-gateway
```

Wrangler prints a `database_id`. Open `apps/gateway/wrangler.jsonc`, find the `production` block, and replace
`00000000-0000-0000-0000-000000000000` in its `d1_databases` entry with that id. Leave the top-level entry alone: it is
the local database for development.

Then create the tables:

```sh
pnpm --filter @buun-mail/gateway db:migrate
```

Optional: to keep raw messages in R2 (object storage) instead of D1, create a bucket with
`wrangler r2 bucket create buun-mail-gateway` and add the `r2_buckets` line the comment in `wrangler.jsonc` shows. R2
needs a payment method on the account. D1 is enough for most people, because collected mail is deleted.

## 3. Give the gateway a Cloudflare token

The gateway points each domain's catch-all at itself, and puts the old one back when you remove the domain. For that it
needs an API token of its own.

1. In the dashboard, open **My Profile**, **API Tokens**, **Create Token**, **Create Custom Token**.
2. Give it two permissions: **Zone, Zone, Read** and **Zone, Email Routing Rules, Edit**.
3. Under **Zone Resources**, include the zones the gateway may manage (all zones, or just your mail domains).
4. Create it and copy it.

Store it, and your account id (shown on the account home page, or by `wrangler whoami`), as secrets of the deployed
Worker:

```sh
pnpm --filter @buun-mail/gateway exec wrangler secret put CLOUDFLARE_API_TOKEN --env production
pnpm --filter @buun-mail/gateway exec wrangler secret put CLOUDFLARE_ACCOUNT_ID --env production
```

Each command asks for the value. If the Worker does not exist yet, Wrangler offers to create it; say yes.

## 4. Deploy the gateway

```sh
pnpm --filter @buun-mail/gateway deploy
```

The first deploy on an account asks you to pick a `workers.dev` subdomain. When it finishes, Wrangler prints the
gateway's address, such as `https://buun-mail-gateway.<your-subdomain>.workers.dev`. Check it answers:

```sh
curl https://buun-mail-gateway.<your-subdomain>.workers.dev/health
# {"ok":true}
```

To serve it on your own hostname instead, add a `routes` entry to the `production` block (the comment there shows
one), deploy again, and use that address below.

## 5. Make a mailbox

A mailbox is what the app signs in to. It owns your domains and has one token. Making it uses Cloudflare's D1 API from
your machine, so it needs a token with **Account, D1, Edit** in this shell. Make one the same way as in section 3 (it
can be a separate, short-lived token):

```sh
export CLOUDFLARE_API_TOKEN=<token with D1 Edit>
export CLOUDFLARE_ACCOUNT_ID=<your account id>
pnpm --filter @buun-mail/gateway mailbox create --name "My mail" --env production
```

Wrangler reads `CLOUDFLARE_API_TOKEN` too, and prefers it over your login. Run `unset CLOUDFLARE_API_TOKEN` (or open a
new shell) before the next `wrangler` command, or give this token the deploy permissions as well. To run `add-domain`
from the command line, the token also needs the two permissions from section 3.

It prints the mailbox id (`mbx_...`) and its token (`bmg_...`). The token is shown once and only its hash is stored.
Keep it somewhere safe. If you lose it, `mailbox rotate-token mbx_... --env production` issues a new one and the old
one stops working.

One mailbox per person is usual. A second mailbox, with its own token, can own other domains on the same gateway.

## 6. Connect Buun Mail and add domains

In the app, open **Settings**, **Integrations**, **Buun Mail Gateway**, **Add a gateway**:

| Field | Value |
|---|---|
| Name | Anything, such as `Work` |
| Gateway address | The address from section 4 |
| Mailbox token | The `bmg_...` token from section 5 |

Press **Connect**. Under **Domains**, **Add a domain** lists the zones in the account that no mailbox owns yet, with
what each catch-all does now. Pick one. The gateway turns Email Routing on for it if needed, keeps the old catch-all,
and points the catch-all at itself. The domain then shows **Receiving here**.

Send a message to any address on that domain. It arrives in the app within seconds, filed by the address it was sent
to. **Remove** a domain to put its catch-all back the way it was.

The same can be done from the command line: `mailbox add-domain mbx_... example.com --env production`.

## 7. A domain in another Cloudflare account

Email Routing only hands a zone's mail to a Worker in the same account. For a domain in a second account you have two
choices:

| Choice | When | How |
|---|---|---|
| A second gateway | You want that account to be independent | Repeat sections 2 to 6 in that account, and add it in the app as another gateway |
| A relay | You want one gateway for everything | Deploy `apps/relay` into the second account, as below |

To set up a relay, from the repository root:

1. Tell your gateway about the domain and make a relay key (with the D1 token from section 5 in the shell):

   ```sh
   pnpm --filter @buun-mail/gateway mailbox add-relayed-domain mbx_... other.example --env production
   pnpm --filter @buun-mail/gateway mailbox add-relay mbx_... --name other-account --env production
   ```

   The second command prints a relay key (`bmr_...`), once. Or add the domain in the app with **A domain in another
   Cloudflare account**; the relay key still comes from `add-relay`.

2. In `apps/relay/wrangler.jsonc`, set the `production` block's `GATEWAY_URL` to your gateway's address.

3. Sign Wrangler in to the **second** account (`wrangler logout`, then `wrangler login`), store the key and deploy:

   ```sh
   pnpm --filter @buun-mail/relay exec wrangler secret put RELAY_KEY --env production
   pnpm --filter @buun-mail/relay deploy
   ```

4. In that account's dashboard, open the domain, **Email**, **Email Routing**, **Routing rules**, and set the
   **Catch-all address** to **Send to a Worker**, `buun-mail-relay`. Turn Email Routing on first if it is off.

The relay keeps nothing. When the gateway refuses a message for good (a domain the mailbox does not own) the sender
gets a bounce; when the gateway cannot be reached, or the relay key is wrong, the sender is told to retry later, so no
mail is lost while you fix it.

## Keeping it running

| Task | How |
|---|---|
| Update to a new version | `git pull`, `pnpm install`, `pnpm --filter @buun-mail/gateway db:migrate`, then `pnpm --filter @buun-mail/gateway upload`. That makes a version with no traffic and prints its URL; check `/health` there, then `pnpm --filter @buun-mail/gateway promote`. The relay updates the same way |
| Undo an update | `pnpm --filter @buun-mail/gateway exec wrangler rollback --env production` |
| Watch it live | `pnpm --filter @buun-mail/gateway exec wrangler tail --env production` |
| List mailboxes and domains | `pnpm --filter @buun-mail/gateway mailbox list --env production` |
| Replace a lost or leaked token | `mailbox rotate-token mbx_... --env production`, then paste the new one in the app |
| Revoke a relay | `mailbox relays mbx_... --env production`, then `mailbox remove-relay mbx_... rly_... --env production` |
| Stop using the gateway | Remove each domain in the app first, so their catch-alls go back, then `pnpm --filter @buun-mail/gateway exec wrangler delete --env production` |

Migrate before you upload: migrations only add, so the running version keeps working against the new schema. If a
release's notes say it adds a Durable Object class, use `deploy` instead of `upload` for that one.

### A preview gateway (optional)

To try a new version before your real domains see it, run a second gateway with its own database and a spare domain.
It is the same as sections 2 to 6 with the `preview` names:

```sh
pnpm --filter @buun-mail/gateway exec wrangler d1 create buun-mail-gateway-preview   # id into the preview block
pnpm --filter @buun-mail/gateway db:migrate:preview
pnpm --filter @buun-mail/gateway exec wrangler secret put CLOUDFLARE_API_TOKEN --env preview
pnpm --filter @buun-mail/gateway exec wrangler secret put CLOUDFLARE_ACCOUNT_ID --env preview
pnpm --filter @buun-mail/gateway deploy:preview
pnpm --filter @buun-mail/gateway mailbox create --name "Preview" --env preview
```

Add it in the app as another gateway, with only the spare domain. Use a separate Cloudflare token for it, never the
production one.

## Troubleshooting

| What you see | Cause | Fix |
|---|---|---|
| `wrangler deploy` fails on the database | The `production` `database_id` is still the zeros | Section 2 |
| The app says the gateway refused the token | Wrong or rotated token | Paste the current `bmg_...` token, or rotate it |
| A refusal you do not understand | The answer's `errorCode` names it, and its `requestId` matches a line in `wrangler tail` | See the error table in the [gateway README](../apps/gateway/README.md) |
| **Add a domain** says the gateway has no Cloudflare token | The secrets are missing | Section 3, then deploy again |
| Adding a domain says Cloudflare refused the change | The gateway's token lacks a permission, or misses that zone | Check the two permissions and its zone resources; turn Email Routing on for the domain in the dashboard |
| A domain is missing from **Add a domain** | It is in another account, or another mailbox owns it | Section 7, or `mailbox list --env production` |
| A domain shows **Not routed here** | Its catch-all was changed in the dashboard | Remove the domain and add it again |
| Senders get "This address does not accept mail." | No mailbox owns that domain | Add the domain to a mailbox |
| `mailbox ... --env production` says a variable is not set | The D1 token is not in this shell | Section 5 |

## See also

| Doc | Why |
|---|---|
| [Gateway README](../apps/gateway/README.md) | The API, how domains are claimed, and how to run it locally |
| [Relay README](../apps/relay/README.md) | What the relay does with each answer from the gateway |
| [Project README](../README.md) | Workspaces, the routing file, and the other mail sources |
| Cloudflare Email Routing, https://developers.cloudflare.com/email-routing/ | Turning routing on, catch-alls, and limits |
| Email Workers, https://developers.cloudflare.com/email-routing/email-workers/ | How a Worker receives mail |
| Wrangler, https://developers.cloudflare.com/workers/wrangler/ | `login`, `d1`, `secret`, `deploy`, `tail` |
