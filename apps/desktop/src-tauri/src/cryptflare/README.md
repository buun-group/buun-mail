# CryptFlare

Sign in to a CryptFlare organisation with OAuth, choose a workspace and environment, and every new or changed
dissolve.email agent identity is saved there automatically. The whole flow, endpoints and errors are in
[docs/cryptflare.md](../../../../../docs/cryptflare.md).

## Standards

Code here follows:

| Standard | What it governs |
|---|---|
| [Security](../../../../../.standards/docs/standards/core/security.md) | Tokens, the client id and every waiting value sealed at rest; private details only in the encrypted value |
| [Resilience](../../../../../.standards/docs/standards/core/resilience.md) | A save kept until written, retried with a growing wait; a refusal stops the pass |
| [Concurrency](../../../../../.standards/docs/standards/core/concurrency-async.md) | One refresh at a time (a refresh token works once), one pass over the queue at a time |
| [Error handling](../../../../../.standards/docs/standards/core/error-handling.md) | `CfError` in words for Settings |

## What is saved

One secret per identity, in the chosen environment:

| Part | What | Encrypted |
|---|---|---|
| Key | `DISSOLVE_` and the address in upper snake case, such as `DISSOLVE_ADA_SHOP_EXAMPLE` | No |
| Value | JSON: email, password, label, persona (name, birthday, phone, address), identity id | Yes |
| Description | `dissolve.email agent identity`, with the label | No |
| Metadata | `source`, `kind`, `identityId`, `inboxId`, `expiresAt`, and `ended` once it ends | No |

| Event | Call |
|---|---|
| Identity made | Create the secret; `409` means a new version |
| New persona and password | A new version at once (the old password cannot be read again) |
| Renamed or extended | Description and metadata only |
| Deleted, or its inbox ended | `ended` added to the metadata; the secret is kept |

## Contents

| Path | Purpose |
|---|---|
| `mod.rs` | The module and what it exports |
| `settings.rs` | The connection, where saves go and the waiting saves, in `cryptflare.json`, every secret sealed |
| `api.rs` | The REST calls: whoami, workspaces, environments, create, rotate, settings |
| `entry.rs` | An identity as a secret: key, value, description, metadata; merging saves of the same key |
| `service.rs` | Connecting with the REST API as the audience, choosing where saves go, hearing identity changes |
| `sign_in.rs` | The sign-in waiting for the browser: its approval link to open again or copy into another browser, and Cancel |
| `queue.rs` | Writing waiting saves with retries, and refreshing the token one at a time |
| `tests.rs` | The integration against a fake server: sign-in, saves, versions, retries, refusals, one refresh, sign-out |
