# Gateway Durable Object

The one Durable Object: a notifier per mailbox. It stores no mail; that is D1's (or R2's) job.

## Standards

Code here follows:

| Standard | What it governs |
|---|---|
| [Durable Objects](../../../../.standards/docs/standards/packs/cloudflare/durable-objects.md) | The hibernation API, one object per mailbox |

## Contents

| Path | Purpose |
|---|---|
| `notifier.ts` | `MailboxNotifier`: holds a mailbox's app WebSockets on the hibernation API, sends `{"type":"arrived","id":...}` for each new message, and answers `ping` with an auto-response that never wakes it |
