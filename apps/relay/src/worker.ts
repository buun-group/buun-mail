import { relay } from './relay'
import type { IncomingEmail, RelayEnv } from './relay'

export default {
  /** The domain's Email Routing catch-all: every message goes on to the gateway. */
  email(message: IncomingEmail, env: RelayEnv): Promise<void> {
    return relay(message, env)
  },
  /** Nothing is served over HTTP; the relay only receives mail. */
  fetch(): Response {
    return new Response('This Worker relays mail only.', { status: 404 })
  },
}
