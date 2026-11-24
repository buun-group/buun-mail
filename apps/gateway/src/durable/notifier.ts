/**
 * One per mailbox: holds its apps' WebSockets and tells them when mail arrives. Uses the hibernation API, so an idle
 * connection costs nothing while it waits, and answers an app's `ping` with an auto-response, so a heartbeat never
 * wakes it. It stores no mail; that is D1's (or R2's) job.
 */

/** A request and the reply the runtime sends to it without waking the object. */
declare const WebSocketRequestResponsePair: new (request: string, response: string) => unknown

/** The slice of the Durable Object state this class uses. */
interface NotifierState {
  acceptWebSocket(socket: WebSocket): void
  getWebSockets(): WebSocket[]
  setWebSocketAutoResponse(pair: unknown): void
}

/** The runtime's socket pair, declared here as the rest of the Workers types are. */
declare const WebSocketPair: new () => { 0: WebSocket; 1: WebSocket }

/** What an app may send to keep the connection known alive. */
export const PING = 'ping'

/** The reply to a ping. Apps since the first gateway expect exactly this text. */
export const PONG = JSON.stringify({ type: 'pong' })

/** The path the Worker posts a notification to. */
const NOTIFY_PATH = '/notify'

export class MailboxNotifier {
  readonly #state: NotifierState

  constructor(state: NotifierState) {
    this.#state = state
    // Answered by the runtime itself: a ping neither wakes the object nor adds to its billed duration.
    state.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG))
  }

  async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname === NOTIFY_PATH && request.method === 'POST') {
      const message = await request.text()
      for (const socket of this.#state.getWebSockets()) {
        try {
          socket.send(message)
        } catch {
          // A socket that closed between the list and the send is dropped by the runtime; nothing to do.
        }
      }
      return new Response(null, { status: 204 })
    }
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Open this as a WebSocket.', { status: 426 })
    const pair = new WebSocketPair()
    this.#state.acceptWebSocket(pair[1])
    return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit)
  }
}
