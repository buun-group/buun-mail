# Gateway routes

The `/v1` HTTP API. Routes parse and answer; the services decide and query.

## Standards

Code here follows:

| Standard | What it governs |
|---|---|
| [Service layer](../../../../.standards/docs/standards/packs/node-api/service-layer.md) | No SQL here; a route calls a service |
| [Routing](../../../../.standards/docs/standards/packs/node-api/routing.md) and [OpenAPI](../../../../.standards/docs/standards/packs/node-api/openapi.md) | One `createRoute` per endpoint with its JSDoc block, and a router per resource group |
| [Errors](../../../../.standards/docs/standards/packs/node-api/errors.md) | A refusal is a thrown `ApiError`; the app's error handler renders the envelope |
| [Security](../../../../.standards/docs/standards/core/security.md) | Every route behind a token or relay key, input parsed with Zod, one refusal one message |

## Contents

| Path | Purpose |
|---|---|
| `messages.ts` | The app API for mail: list waiting messages, fetch one's bytes as `message/rfc822`, acknowledge what the app stored, and the `/v1/stream` WebSocket |
| `domains.ts` | `/v1/domains`: the mailbox's domains, the zones it could claim, claiming one or recording a relayed one, and giving one back |
| `relay.ts` | `POST /v1/relay/messages`, for a relay in another Cloudflare account, with its own key, the envelope in headers |
