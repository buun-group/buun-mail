# CryptFlare integration

How Buun Mail connects to a person's CryptFlare account with OAuth 2.1 and saves secrets into a CryptFlare workspace
and environment the person chooses. The first use: every dissolve.email agent identity (its address, password and
persona) is saved there automatically, so none is ever lost. The sign-in is the same flow as dissolve.email's, from
the shared `apps/desktop/src-tauri/src/oauth/`: discovery, dynamic registration, PKCE, the loopback redirect on a
computer and the app link on a phone, and sealed tokens. The code is in
[`apps/desktop/src-tauri/src/cryptflare/`](../apps/desktop/src-tauri/src/cryptflare/README.md).

## TL;DR

| Rule | Yes | No |
| --- | --- | --- |
| Sign in with OAuth 2.1, authorization code and PKCE S256 | `/oauth/authorize` with `code_challenge`, then `/oauth/token` | Asking the person to paste a CryptFlare API token |
| Register once per install (RFC 7591) and keep the `client_id` | `POST /oauth/register` with the loopback or app-link redirect | Registering on every sign-in |
| Ask for the REST API as the audience | `resource=https://api.cryptflare.com` on authorize and token | No `resource` (you get an MCP-only token) |
| Ask only for what saving needs | `secrets:write secrets:list workspaces:read environments:read` | `secrets:read` or the MCP defaults |
| Refresh one at a time and save the new refresh token at once | Single-flight refresh, written before the next call | Two refreshes with the same refresh token (the second revokes the connection) |
| Check `iss` and `state` on the way back | `iss` = `https://mcp.cryptflare.com` | Trusting any redirect that carries a `code` |
| Keep private details in the encrypted value | Password, name, phone, address in the secret's value | Any of them in `metadata` or `description`, which CryptFlare keeps unencrypted |
| Keep a save until it is written | A sealed queue in `cryptflare.json`, retried | Dropping a save because CryptFlare was down or the token lapsed |
| Seal everything secret at rest | Tokens, client id and waiting values sealed, as the dissolve tokens are | Plain tokens or passwords in `cryptflare.json` |

## 1. Endpoints

| What | Production |
| --- | --- |
| Authorization server (issuer) | `https://mcp.cryptflare.com` |
| Its metadata (RFC 8414) | `https://mcp.cryptflare.com/.well-known/oauth-authorization-server` |
| Registration (RFC 7591) | `POST https://mcp.cryptflare.com/oauth/register` |
| Authorize | `GET https://mcp.cryptflare.com/oauth/authorize` |
| Token | `POST https://mcp.cryptflare.com/oauth/token` |
| Revoke (RFC 7009) | `POST https://mcp.cryptflare.com/oauth/revoke` |
| REST API (the audience) | `https://api.cryptflare.com/v1` |

The endpoints are read from the metadata, not hard-coded. Locally: issuer `http://localhost:5497`, API
`http://localhost:5488`.

## 2. The client

On CryptFlare itself (`mcp.cryptflare.com`) the app signs in as Buun Mail's built-in client, `sys_buun_mail`, with no
registration: the approval page shows it as verified, and both redirects below are already allowed. Any other
CryptFlare (local, self-hosted) gets a client registered once per install:

```http
POST /oauth/register
Content-Type: application/json

{ "client_name": "Buun Mail", "redirect_uris": ["http://127.0.0.1/callback"] }
```

- A phone registers `com.buungroup.mail:/oauth/callback` instead (the same `APP_LINK` dissolve uses).
- The answer's `client_id` (`cfc_...`) is kept sealed in the settings with the redirect it was registered for.
- A loopback redirect matches on any port (RFC 8252 section 7.3), so the one-shot listener picks a free port each time
  and sends `http://127.0.0.1:<port>/callback`.
- The consent screen shows a registered client as **Unverified**; only `sys_buun_mail` shows as verified.
- Signing in with `sys_buun_mail` after an older registered client hands the old refresh token back, so CryptFlare's
  connected apps list Buun Mail once.

## 3. Send the person to approve

The app opens the system browser at:

```text
https://mcp.cryptflare.com/oauth/authorize
  ?response_type=code
  &client_id=<cfc_...>
  &redirect_uri=http://127.0.0.1:<port>/callback
  &scope=secrets:write secrets:list workspaces:read environments:read
  &state=<random>
  &code_challenge=<base64url(SHA-256(verifier))>
  &code_challenge_method=S256
  &resource=https://api.cryptflare.com
```

The browser goes to the CryptFlare vault (`/oauth/consent`). The person signs in if they need to, then chooses the
organisation, the workspaces the app may reach (some, or all), and which of the asked-for scopes to grant. Then Allow
or Deny. The request lasts 10 minutes.

## 4. The way back

The listener receives `?code=cfac_...&state=...&iss=https://mcp.cryptflare.com`, or `?error=access_denied&state=...`.
The answer is refused unless `state` matches and `iss` is the issuer from the metadata. The code lasts 2 minutes and
works once.

## 5. Trade the code for tokens

```http
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&code=<cfac_...>&redirect_uri=<the exact one sent>&client_id=<cfc_...>&code_verifier=<verifier>&resource=https://api.cryptflare.com
```

```json
{ "access_token": "cf_oat_...", "token_type": "Bearer", "expires_in": 3600, "refresh_token": "cf_ort_...", "scope": "secrets:list secrets:write workspaces:read environments:read" }
```

`scope` is what the person granted and can be less than asked. Without `secrets:write`, Settings says so and the
switch stays off.

## 6. Keep the tokens fresh

- The app refreshes when the access token has under a minute left, or once on a `401`.
- **Every refresh token works once.** The answer carries a new one, saved before the new access token is used.
- **Presenting a used refresh token again disconnects the app.** One refresh runs at a time (a lock around it), and a
  caller that waited for the lock uses the token the refresh before it saved.
- `invalid_grant` on refresh means the connection is gone (disconnected in CryptFlare, lapsed after 90 days, or a
  refresh token reused). Saving stops and Settings asks to connect again; waiting saves are kept.
- On sign-out the app hands the refresh token back with `POST /oauth/revoke` (`token`, `client_id`), which always
  answers `200`.

## 7. The REST calls

Every call sends `Authorization: Bearer cf_oat_...`. A token is bound to the organisation and workspaces the person chose.

| Step | Call | Notes |
| --- | --- | --- |
| Who and which organisation | `GET /v1/auth/whoami` | `orgId`, `organisation.name` |
| Workspaces to offer | `GET /v1/organisations/{org}/workspaces` | Only the ones the grant allows |
| Environments | `GET /v1/organisations/{org}/workspaces/{ws}/environments` | |
| Save a new secret | `POST .../environments/{env}/secrets` with `{ key, value, description, metadata }` | `201`; `409` when the key exists |
| A new version | `POST .../environments/{env}/secrets/{key}/rotate` with `{ value }` | Needs `secrets:write` |
| Description and metadata | `PATCH .../environments/{env}/secrets/{key}/settings` with `{ description, metadata }` | No new version |

Errors are RFC 9457 JSON (`code`, `detail`): `401` refresh once, then reconnect; `403` (`RBAC_FORBIDDEN`) stop and
show it, never retry; `429` honour `Retry-After`.

## 8. Saving agent identities automatically

Settings, Integrations, **Keep secrets in**, CryptFlare: connect, choose the workspace and environment, then turn on
**Save agent identities automatically**. **Save them now** saves the identities made before the switch was on, each
read from dissolve.email with its password.

### One secret per identity

| Part | What | Encrypted |
| --- | --- | --- |
| Key | `DISSOLVE_` and the address in upper snake case: `ada@shop.example` is `DISSOLVE_ADA_SHOP_EXAMPLE` | No |
| Value | JSON: `email`, `password`, `label`, `persona` (name, username, birthday, country, phone, address), `identityId` | Yes |
| Description | `dissolve.email agent identity`, with the person's label | No |
| Metadata | `source: buun-mail`, `kind: dissolve-identity`, `identityId`, `inboxId`, `expiresAt`, and `ended` once it ends | No |

CryptFlare keeps `metadata` and `description` unencrypted, so nothing private goes there: the persona is a made-up
person, but its name, phone and address still stay in the value.

### What each change does

| On dissolve.email or in the app | CryptFlare call |
| --- | --- |
| An identity made (with a new address, or added to one) | Create the secret; `409` means a new version |
| A new persona and password | A new version straight away: the old password cannot be read again |
| Renamed or extended | Description and metadata only, no new version |
| Deleted, or its inbox ended or was burned | `ended` added to the metadata; the secret is kept, never deleted |

The dissolve module announces these changes (`IdentityChange`) without knowing who listens; `lib.rs` hands them to
the CryptFlare service, which queues a save only while the switch is on and an organisation is connected.

### The queue

- A save waits in `cryptflare.json` (its value sealed) until it is written, so an identity made while CryptFlare is
  down, or while the token has lapsed, is written later.
- Saves of the same key merge: a rename straight after making an identity still writes its password.
- A failed save is tried again after 30 seconds, doubling up to an hour; the loop also runs every five minutes, and at
  once when woken by a new save, a new target or a reconnect.
- A `403` or a lapsed connection stops the pass (every other save would meet the same refusal) and Settings shows why.
  **Try now** writes everything waiting at once.
- Disconnecting drops waiting saves, since they hold passwords. Secrets already saved stay in CryptFlare.

## 9. Privacy and storage

- `cryptflare.json` beside `dissolve.json` holds the servers, the sealed client id and tokens, the organisation, the
  target, the switch, the sealed waiting saves, and the metadata last written per key (no values).
- Values are never logged, never sent to the window, and never read back from CryptFlare.

## 10. What CryptFlare does not offer yet

| Gap | Effect on Buun Mail | Fix on the CryptFlare side |
| --- | --- | --- |
| First-party clients | Done: on `mcp.cryptflare.com` the app signs in as the built-in `sys_buun_mail` client (public, PKCE S256, the loopback redirects on any port and `com.buungroup.mail:/oauth/callback` exactly), shown as verified. A local or self-hosted CryptFlare still gets a registered client | - |
| No save-or-update call | Create, then `rotate` on `409` (one pass at a time, so two saves never race) | `PUT .../secrets/{key}` (planned) |
| Previews have no `INTERNAL_API` binding | Sign-in fails with `503` against a CryptFlare preview | Test against production or local |

## 11. Tests

`cryptflare/tests.rs` runs against a fake CryptFlare server: sign-in with the REST API as the audience and sealed
tokens; save, `409` to a new version, metadata only, ended; a save kept while the server is down and written later; a
`403` stopping the pass with no writes; two callers racing over an expired token making one refresh; nothing saved
while off; sign-out revoking and dropping waiting saves. `cryptflare/entry.rs` checks the key and that private details
stay out of the metadata, and `dissolve/tests.rs` checks each identity change is announced. The Settings panel is
tested in `ui/src/__tests__/cryptflare-connect.test.tsx`.

## See also

| Doc | Why |
| --- | --- |
| [CryptFlare code](../apps/desktop/src-tauri/src/cryptflare/README.md) | The module, file by file |
| [dissolve.email sign-in](../apps/desktop/src-tauri/src/dissolve/README.md) | The same flow, and where identity changes come from |
| CryptFlare `docs/guides/oauth.md` | The server side: consent, scopes, audiences, rotation |
| [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252) | OAuth for native apps: loopback and private-use redirects |
| [RFC 8707](https://www.rfc-editor.org/rfc/rfc8707) | Resource indicators: the token's audience |
| [RFC 7009](https://www.rfc-editor.org/rfc/rfc7009) | Token revocation |
