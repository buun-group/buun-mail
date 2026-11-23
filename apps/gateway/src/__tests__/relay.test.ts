import { describe, expect, it } from 'vitest'

import { REFUSALS } from '../constants'
import { createRelay, deleteRelay } from '../services/relays'
import { auth, createHarness } from './harness'

const RAW = 'From: a@client.example\r\nTo: hello@other.example\r\nSubject: Relayed\r\nMessage-ID: <r1@client.example>\r\n\r\nHi.\r\n'

const relayed = (key: string, from: string, to: string, body = RAW): RequestInit => ({
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'X-Envelope-From': from, 'X-Envelope-To': to, 'Content-Type': 'message/rfc822' },
  body,
})

async function withRelay() {
  const gateway = createHarness()
  const owner = await gateway.mailbox('Other', [])
  await gateway.request('/v1/domains', {
    method: 'POST',
    headers: { Authorization: `Bearer ${owner.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain: 'other.example', via: 'relay' }),
  })
  const { relay, key } = await createRelay(gateway.runtime, owner.mailbox.id, 'other-account')
  return { gateway, owner, relay, key }
}

describe('POST /v1/relay/messages', () => {
  it("takes mail for a domain the relay's mailbox owns, keeps the envelope recipient, and tells its apps", async () => {
    const { gateway, owner, key } = await withRelay()
    const answer = await gateway.request('/v1/relay/messages', relayed(key, 'a@client.example', 'Hello+Launch@Other.example'))
    expect(answer.status).toBe(202)
    const listed = (await (await gateway.request('/v1/messages', auth(owner.token))).json()) as { messages: { envelopeTo: string }[] }
    expect(listed.messages.map((message) => message.envelopeTo)).toEqual(['hello+launch@other.example'])
    expect(gateway.notified).toHaveLength(1)
  })

  it('records a relayed domain without touching Cloudflare', async () => {
    const { gateway, owner } = await withRelay()
    const listed = await gateway.request('/v1/domains', auth(owner.token))
    expect(await listed.json()).toEqual({ domains: [{ domain: 'other.example', via: 'relay', routedHere: null, previously: null }] })
  })

  it('refuses a wrong key, a missing envelope, and a domain the mailbox does not own', async () => {
    const { gateway, key } = await withRelay()
    const wrong = await gateway.request('/v1/relay/messages', relayed('bmr_nope', 'a@b.example', 'x@other.example'))
    expect([wrong.status, ((await wrong.json()) as { message: string }).message]).toEqual([401, REFUSALS.relayUnauthorized])
    const token = await gateway.request('/v1/relay/messages', relayed('bmg_looks_like_a_mailbox_token', 'a@b.example', 'x@other.example'))
    expect(token.status).toBe(401)
    const envelope = await gateway.request('/v1/relay/messages', relayed(key, 'not an address', 'x@other.example'))
    expect([envelope.status, ((await envelope.json()) as { message: string }).message]).toEqual([400, REFUSALS.relayEnvelope])
    const foreign = await gateway.request('/v1/relay/messages', relayed(key, 'a@b.example', 'x@someone-else.example'))
    expect([foreign.status, ((await foreign.json()) as { message: string }).message]).toEqual([403, REFUSALS.relayDomain])
    expect(gateway.mail.objects.size).toBe(0)
  })

  it('stops taking mail from a deleted relay key at once', async () => {
    const { gateway, owner, relay, key } = await withRelay()
    expect(await deleteRelay(gateway.runtime, owner.mailbox.id, relay.id)).toBe(true)
    expect((await gateway.request('/v1/relay/messages', relayed(key, 'a@b.example', 'x@other.example'))).status).toBe(401)
  })

  it("keeps a relayed domain one mailbox's only", async () => {
    const { gateway } = await withRelay()
    const other = await gateway.mailbox('Another', [])
    const taken = await gateway.request('/v1/domains', {
      method: 'POST',
      headers: { Authorization: `Bearer ${other.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: 'other.example', via: 'relay' }),
    })
    expect(taken.status).toBe(409)
  })
})
