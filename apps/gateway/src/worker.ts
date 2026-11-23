import { createApp } from './app'
import { handleEmail } from './email'
import { runtimeFrom } from './lib/runtime'
import { purgeExpired } from './services/messages'
import type { Bindings, IncomingEmail } from './types'

export { MailboxNotifier } from './durable/notifier'

const app = createApp(runtimeFrom)

export default {
  fetch: app.fetch,
  /** Email Routing's catch-all for every domain a mailbox owns. */
  email(message: IncomingEmail, env: Bindings): Promise<void> {
    return handleEmail(runtimeFrom(env), message)
  },
  /** Once a day: drop mail nobody collected within the retention window. */
  async scheduled(_event: unknown, env: Bindings): Promise<void> {
    await purgeExpired(runtimeFrom(env))
  },
}
