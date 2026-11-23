/**
 * Mailbox admin, for the local database or the deployed gateway. Run from the repository root:
 *
 *   pnpm --filter @buun-mail/gateway mailbox create --name "Acme" --env production
 *   pnpm --filter @buun-mail/gateway mailbox list --env production
 *   pnpm --filter @buun-mail/gateway mailbox rename mbx_... --name "Acme Pty Ltd" --env production
 *   pnpm --filter @buun-mail/gateway mailbox rotate-token mbx_... --env production
 *   pnpm --filter @buun-mail/gateway mailbox add-domain mbx_... acme.example --env production
 *   pnpm --filter @buun-mail/gateway mailbox remove-domain mbx_... acme.example --env production
 *   pnpm --filter @buun-mail/gateway mailbox add-relayed-domain mbx_... other.example --env production
 *   pnpm --filter @buun-mail/gateway mailbox add-relay mbx_... --name other-account --env production
 *   pnpm --filter @buun-mail/gateway mailbox relays mbx_... --env production
 *   pnpm --filter @buun-mail/gateway mailbox remove-relay mbx_... rly_... --env production
 *
 * With `--env production` (or `--env preview`) it acts on that deployed gateway and needs CLOUDFLARE_API_TOKEN (with D1 Edit) and
 * CLOUDFLARE_ACCOUNT_ID in the shell; without it, on the local development database. Domains are usually added from
 * Buun Mail, Settings, Integrations; add-domain changes the zone's Email Routing catch-all for real, so it is refused
 * locally. A domain in another Cloudflare account is added with add-relayed-domain and reaches the gateway through a
 * relay (add-relay prints its key). docs/self-hosting.md walks through all of it.
 */
import { parseArgs } from 'node:util'

import { addDomain, addRelayedDomain, removeDomain } from '../src/services/domains'
import { createMailbox, listMailboxes, renameMailbox, rotateToken } from '../src/services/mailboxes'
import { createRelay, deleteRelay, listRelays } from '../src/services/relays'
import { openRuntime } from './lib/target'
import type { Environment } from './lib/target'

const { values, positionals } = parseArgs({ allowPositionals: true, options: { name: { type: 'string' }, env: { type: 'string' } } })
const [command, ...rest] = positionals
const DEPLOYED: readonly Environment[] = ['preview', 'production']
const environment: Environment = DEPLOYED.find((one) => one === values.env) ?? 'local'
if (values.env !== undefined && environment === 'local') throw new Error('--env is preview or production, or left out for local development')

const say = (text: string): void => void process.stdout.write(`${text}\n`)
const { runtime, close } = await openRuntime(environment)
try {
  switch (command) {
    case 'create': {
      if (values.name === undefined) throw new Error('create needs --name')
      const { mailbox, token } = await createMailbox(runtime, values.name, [])
      say(`Made ${mailbox.id} (${mailbox.name}). Its token, shown this once:\n\n  ${token}\n\nPaste it into Buun Mail, Settings, Integrations, Buun Mail Gateway, then add domains there.`)
      break
    }
    case 'list':
      for (const mailbox of await listMailboxes(runtime)) say(`${mailbox.id}  ${mailbox.name}  ${mailbox.domains.join(', ') || '(no domains)'}`)
      break
    case 'rename': {
      const [id] = rest
      if (id === undefined || values.name === undefined) throw new Error('rename needs a mailbox id and --name')
      say((await renameMailbox(runtime, id, values.name)) ? 'Renamed.' : 'No such mailbox.')
      break
    }
    case 'rotate-token': {
      const [id] = rest
      if (id === undefined) throw new Error('rotate-token needs a mailbox id')
      const token = await rotateToken(runtime, id)
      say(token === null ? 'No such mailbox.' : `The old token no longer works. The new one, shown this once:\n\n  ${token}\n`)
      break
    }
    case 'add-domain':
    case 'remove-domain': {
      const [id, domain] = rest
      if (id === undefined || domain === undefined) throw new Error(`${command} needs a mailbox id and a domain`)
      if (environment === 'local') throw new Error(`${command} changes the domain's live mail routing; run it with --env production`)
      if (command === 'add-domain') {
        const added = await addDomain(runtime, id, domain)
        say(`${added.domain} now routes to this gateway.${added.previously === null ? '' : ` Before, its catch-all did: ${added.previously}. Removing the domain puts that back.`}`)
      } else {
        await removeDomain(runtime, id, domain)
        say(`${domain} is removed, and its catch-all is back to what it was.`)
      }
      break
    }
    case 'add-relayed-domain': {
      const [id, domain] = rest
      if (id === undefined || domain === undefined) throw new Error('add-relayed-domain needs a mailbox id and a domain')
      const added = await addRelayedDomain(runtime, id, domain)
      say(`${added.domain} is this mailbox's; its mail arrives through a relay in its own Cloudflare account.`)
      break
    }
    case 'add-relay': {
      const [id] = rest
      if (id === undefined || values.name === undefined) throw new Error('add-relay needs a mailbox id and --name')
      const { relay, key } = await createRelay(runtime, id, values.name)
      say(`Made relay ${relay.id} (${relay.name}). Its key, shown this once:\n\n  ${key}\n\nSet it as the relay Worker's RELAY_KEY secret.`)
      break
    }
    case 'relays': {
      const [id] = rest
      if (id === undefined) throw new Error('relays needs a mailbox id')
      for (const relay of await listRelays(runtime, id)) say(`${relay.id}  ${relay.name}`)
      break
    }
    case 'remove-relay': {
      const [id, relayId] = rest
      if (id === undefined || relayId === undefined) throw new Error('remove-relay needs a mailbox id and a relay id')
      say((await deleteRelay(runtime, id, relayId)) ? 'Removed; its key no longer works.' : 'No such relay.')
      break
    }
    default:
      say('Commands: create, list, rename, rotate-token, add-domain, remove-domain, add-relayed-domain, add-relay, relays, remove-relay. See the top of scripts/mailbox.ts.')
  }
} finally {
  await close()
}
