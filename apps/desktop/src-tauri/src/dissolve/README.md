# dissolve.email

Sign in with OAuth, and dissolve.email's disposable inboxes become a workspace with one folder per inbox, collected
the way the account's plan allows, as the website does.

## Standards

Code here follows:

| Standard | What it governs |
|---|---|
| [Security](../../../../../.standards/docs/standards/core/security.md) | Tokens sealed at rest, PKCE, the loopback redirect checked exactly |
| [Resilience](../../../../../.standards/docs/standards/core/resilience.md) | A time limit on every call, reconnecting with a growing wait, a fallback for every server |
| [Error handling](../../../../../.standards/docs/standards/core/error-handling.md) | `ApiError` in words for Settings, a plan limit with its count |

## How new mail arrives

| Plan or server | How | How soon |
|---|---|---|
| Pro, Business | The account stream (`GET /v1/stream`): one WebSocket for every inbox; each event wakes a check | Seconds |
| Free | The changes feed (`GET /v1/messages?since=`), one call for every inbox, every minute | Up to a minute |
| A server without the feed | Each inbox's messages, four inboxes a minute in turn (the server's polling limit) | Minutes, more with more inboxes |

A check reads the changes feed from its saved cursor, so a restart carries on where it stopped. With no cursor (the
first sign-in, or one older than the feed's seven days) it takes the feed's head and polls each inbox once for the mail
from before it. While the stream is up, a check also runs every ten minutes as a safety net.

## Kept in step with the website

| What | Website to app | App to website |
|---|---|---|
| Deleting a message | The feed's `removed` deletes it here | Deleted for good here (Delete forever, emptying the trash) deletes it there |
| Labels and tags | Not possible: dissolve.email's messages do not carry their labels | A tag put on or taken off here moves the label of the same name (any case), if one exists |
| Aliases | Listed from the inbox | Added and removed from an inbox's bar (Pro and Business) |
| Agent identities | Listed on the workspace's page | Renamed, extended and deleted there; deleting keeps the inbox and its mail |

Only changes made by a person, a rule or an agent are sent (the mailbox's `Changed` events); the app's own deletions,
such as an inbox that ended, are never sent back. dissolve.email sets an identity's expiry to now plus the minutes it
is sent, even for a rename, so the minutes are always worked out from its current expiry: a rename keeps it, Extend
adds the plan's inbox time to what is left.

## Contents

| Path | Purpose |
|---|---|
| `mod.rs` | The module and what it exports |
| `oauth.rs` | Discovery, registration, PKCE, the way back from the browser (loopback or app link), tokens |
| `api.rs` | The `/v1` calls for reading mail, the changes feed included |
| `manage_api.rs` | The `/v1` calls for managing: deleting a message, aliases, labels, agent identities |
| `manage.rs` | Deletions both ways, tags to labels, aliases and the identity list, for the commands |
| `stream.rs` | The account stream: events that wake a check, the heartbeat, and what each ending means |
| `settings.rs` | The account, its tokens, the feed's cursor and what has been collected, in `dissolve.json` |
| `service.rs` | Connecting, the collection loop and the stream thread, and the inbox actions |
| `tests.rs` | The integration against a fake server: sign-in, the feed, the fallback, expiry, refresh, identities |
