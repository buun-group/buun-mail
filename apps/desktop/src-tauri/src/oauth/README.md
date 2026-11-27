# OAuth

Signing in to a service from an installed app (OAuth 2.1, RFC 8252), shared by every service Buun Mail connects to:
dissolve.email and CryptFlare. Each service keeps its own scopes, client ids and audience; the flow lives here.

## Standards

Code here follows:

| Standard | What it governs |
|---|---|
| [Security](../../../../../.standards/docs/standards/core/security.md) | PKCE S256, the state and issuer checked before a code is read, tokens never sent to the window |
| [Error handling](../../../../../.standards/docs/standards/core/error-handling.md) | `OAuthError` in words for Settings |

## Contents

| Path | Purpose |
|---|---|
| `mod.rs` | Metadata (RFC 8414), registration (RFC 7591), PKCE, the authorize address with its audience (RFC 8707), the code exchange, refresh and revoke |
| `back.rs` | The way back from the browser: a one-shot listener on 127.0.0.1 on a computer, the app link on a phone, and reading the answer |
