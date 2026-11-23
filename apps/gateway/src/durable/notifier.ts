/**
 * One per mailbox: holds its apps' WebSockets and tells them when mail arrives. Uses the hibernation API, so an idle
 * connection costs nothing while it waits. It stores no mail; that is D1's (or R2's) job.
 */

/** The slice of the Durable Object state this class uses. */
interface NotifierState {
  acceptWebSocket(socket: WebSocket): void
  getWebSockets(): WebSocket[]
}

/** The runtime's socket pair, declared here as the rest of the Workers types are. */
declare const WebSocketPair: new () => { 0: WebSocket; 1: WebSocket }

/** What an app may send: a ping, answered with a pong, to keep the connection known alive. */
const PING = 'ping'

/** The path the Worker posts a notification to. */
const NOTIFY_PATH = '/notify'

export class MailboxNotifier {
  readonly #state: NotifierState

  constructor(state: NotifierState) {
    this.#state = state
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

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    if (message === PING) socket.send(JSON.stringify({ type: 'pong' }))
  }
}
