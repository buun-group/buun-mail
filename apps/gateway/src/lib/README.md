# Gateway library

What routes and services share: the runtime, the bearer check, ids, hashing, Cloudflare's API and where raw mail is
kept.

## Standards

Code here follows:

| Standard | What it governs |
|---|---|
| [Service layer](../../../../.standards/docs/standards/packs/node-api/service-layer.md) | Libraries hold pure helpers and I/O wrappers, never a route's context |
| [Resilience](../../../../.standards/docs/standards/core/resilience.md) | A time limit on every Cloudflare call, its answers parsed with Zod |
| [Security](../../../../.standards/docs/standards/core/security.md) | Web Crypto for tokens and hashes, never `Math.random` |

## Contents

| Path | Purpose |
|---|---|
| `runtime.ts` | `Runtime`: everything a route or service may reach, built once per request or event |
| `auth.ts` | The mailbox middleware: the bearer token, hashed before the lookup, and what a route can read after it |
| `api-error.ts` | `ApiError` (status, stable code, words) and the error envelope it renders as |
| `openapi.ts` | The router every route group uses (a failed schema throws the standard refusal), the error schema, the bearer scheme |
| `ids.ts` | Public ids: a prefix (`mbx_`, `mml_`, `rly_`) and 24 random characters |
| `crypto.ts` | Random hex for tokens and keys, and the SHA-256 they are stored as |
| `cloudflare.ts` | Zones and Email Routing catch-alls in the gateway's own Cloudflare account, every answer parsed, and `parseCatchAll` for the stored rule |
| `blobs.ts` | The raw mail store: R2 when the `MAIL` binding exists, with D1 behind it; `d1Bucket` keeps a message in D1 as half-megabyte parts |
