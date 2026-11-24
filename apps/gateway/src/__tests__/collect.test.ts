import { describe, expect, it } from 'vitest'

import { INLINE_MESSAGE_MAX, NOTIFY_ATTEMPTS } from '../constants'
import { MailboxNotifier, PING, PONG } from '../durable/notifier'
import { handleEmail } from '../email'
import { createHarness, incoming } from './harness'

const RAW = 'From: a@client.example\r\nTo: billing@acme.example\r\nSubject: Invoice\r\n\r\nHello.\r\n'

type Collected = { acknowledged: number; messages: { id: string; envelopeTo: string; size: number; raw?: string }[] }

/** A gateway with a `collect` helper that posts to /v1/messages/collect with a token. */
function gatewayWithCollect() {
  const gateway = createHarness()
  const collect = (token: string, body: unknown) =>
    gateway.request('/v1/messages/collect', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { gateway, collect }
}

describe('POST /v1/messages/collect', () => {
  it('forgets what is acknowledged, then lists the rest oldest first with small messages inline', async () => {
    const { gateway, collect } = gatewayWithCollect()
    const acme = await gateway.mailbox('Acme', ['acme.example'])
    const globex = await gateway.mailbox('Globex', ['globex.example'])
    await handleEmail(gateway.runtime, incoming('a@b.example', 'first@acme.example', RAW))
    gateway.advance(1000)
    await handleEmail(gateway.runtime, incoming('a@b.example', 'second@acme.example', RAW))
    await handleEmail(gateway.runtime, incoming('a@b.example', 'other@globex.example', RAW))

    const first = (await (await collect(acme.token, {})).json()) as Collected
    expect(first.acknowledged).toBe(0)
    expect(first.messages.map((message) => message.envelopeTo)).toEqual(['first@acme.example', 'second@acme.example'])
    expect(first.messages.map((message) => atob(message.raw ?? ''))).toEqual([RAW, RAW])

    const second = (await (await collect(acme.token, { ack: first.messages.map((message) => message.id) })).json()) as Collected
    expect(second).toEqual({ acknowledged: 2, messages: [] })
    expect(gateway.messageIds()).toHaveLength(1)
    expect((await (await collect(globex.token, { limit: 1 })).json()) as Collected).toMatchObject({ messages: [{ envelopeTo: 'other@globex.example' }] })
  })

  it('refuses a body that is not valid, and a token it does not know', async () => {
    const { gateway, collect } = gatewayWithCollect()
    const acme = await gateway.mailbox('Acme', ['acme.example'])
    expect((await collect(acme.token, { ack: ['not-an-id'] })).status).toBe(400)
    expect((await collect(acme.token, { limit: 0 })).status).toBe(400)
    expect((await collect('bmg_wrong', {})).status).toBe(401)
  })

  it('leaves a message too large to inline for /raw', async () => {
    const { gateway, collect } = gatewayWithCollect()
    const acme = await gateway.mailbox('Acme', ['acme.example'])
    const big = `${RAW}${'x'.repeat(INLINE_MESSAGE_MAX)}`
    await handleEmail(gateway.runtime, incoming('a@b.example', 'big@acme.example', big))
    gateway.advance(1000)
    await handleEmail(gateway.runtime, incoming('a@b.example', 'small@acme.example', RAW))
    const { messages } = (await (await collect(acme.token, {})).json()) as Collected
    expect(messages.map((message) => [message.envelopeTo, message.raw === undefined])).toEqual([
      ['big@acme.example', true],
      ['small@acme.example', false],
    ])
    expect(messages[0]?.size).toBe(big.length)
  })
})

describe('telling the apps', () => {
  it('tries the note again when it fails, and keeps the message even if every try does', async () => {
    const gateway = createHarness()
    await gateway.mailbox('Acme', ['acme.example'])
    let calls = 0
    gateway.runtime.notify = () => {
      calls += 1
      return calls < NOTIFY_ATTEMPTS ? Promise.reject(new Error('notifier unavailable')) : Promise.resolve()
    }
    await handleEmail(gateway.runtime, incoming('a@b.example', 'x@acme.example', RAW))
    expect(calls).toBe(NOTIFY_ATTEMPTS)

    calls = 0
    gateway.runtime.notify = () => {
      calls += 1
      return Promise.reject(new Error('notifier down'))
    }
    const message = incoming('a@b.example', 'y@acme.example', RAW)
    await handleEmail(gateway.runtime, message)
    expect(calls).toBe(NOTIFY_ATTEMPTS)
    expect(message.rejected).toBeNull()
    expect(gateway.messageIds()).toHaveLength(2)
  })

  it('answers a ping with the auto-response, so a heartbeat never wakes the notifier', () => {
    const pairs: unknown[] = []
    class Pair {
      constructor(
        readonly request: string,
        readonly response: string,
      ) {}
    }
    Object.assign(globalThis, { WebSocketRequestResponsePair: Pair })
    const notifier = new MailboxNotifier({ acceptWebSocket: () => undefined, getWebSockets: () => [], setWebSocketAutoResponse: (pair) => pairs.push(pair) })
    expect(pairs).toEqual([new Pair(PING, PONG)])
    expect(PONG).toBe('{"type":"pong"}')
    expect('webSocketMessage' in notifier).toBe(false)
  })
})
