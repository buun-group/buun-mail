import { describe, expect, it } from 'vitest'

import { RetryLater, relay } from '../relay'
import type { IncomingEmail } from '../relay'

const RAW = 'From: a@client.example\r\nTo: hello@other.example\r\nSubject: Hi\r\n\r\nHello.\r\n'
const ENV = { GATEWAY_URL: 'https://gateway.test', RELAY_KEY: 'bmr_key' }

function message(): IncomingEmail & { rejected: string | null } {
  const bytes = new TextEncoder().encode(RAW)
  const incoming = {
    from: 'a@client.example',
    to: 'Hello@other.example',
    rawSize: bytes.byteLength,
    raw: new ReadableStream<Uint8Array>({
      start: (controller) => {
        controller.enqueue(bytes)
        controller.close()
      },
    }),
    rejected: null as string | null,
    setReject: (reason: string) => {
      incoming.rejected = reason
    },
  }
  return incoming
}

/** A fetch that answers with `status` and records the request it was given. */
function gateway(status: number) {
  const seen: Request[] = []
  const fetcher = ((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    seen.push(new Request(input, init))
    return Promise.resolve(new Response('{}', { status }))
  }) as typeof fetch
  return { seen, fetcher }
}

describe('relay()', () => {
  it('posts the raw message with its envelope and key to the gateway', async () => {
    const { seen, fetcher } = gateway(202)
    const incoming = message()
    await relay(incoming, ENV, fetcher)
    const [request] = seen
    expect(request?.url).toBe('https://gateway.test/v1/relay/messages')
    expect(request?.headers.get('Authorization')).toBe('Bearer bmr_key')
    expect(request?.headers.get('X-Envelope-To')).toBe('Hello@other.example')
    expect(await request?.text()).toBe(RAW)
    expect(incoming.rejected).toBeNull()
  })

  it('bounces mail the gateway refuses for good', async () => {
    const incoming = message()
    await relay(incoming, ENV, gateway(403).fetcher)
    expect(incoming.rejected).toBe('This address does not accept mail.')
  })

  it('asks the sender to retry when the gateway is down, failing, or the relay key is wrong', async () => {
    for (const status of [500, 503, 401, 429]) await expect(relay(message(), ENV, gateway(status).fetcher)).rejects.toBeInstanceOf(RetryLater)
  })

  it('asks the sender to retry when the gateway cannot be reached', async () => {
    const unreachable = (() => Promise.reject(new Error('connection refused'))) as typeof fetch
    await expect(relay(message(), ENV, unreachable)).rejects.toBeInstanceOf(RetryLater)
  })

  it('asks the sender to retry when the relay has no key', async () => {
    await expect(relay(message(), { GATEWAY_URL: 'https://gateway.test' }, gateway(202).fetcher)).rejects.toBeInstanceOf(RetryLater)
  })
})
