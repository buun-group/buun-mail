import { isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

import type { Message } from './types'

/** Event names. `src-tauri/src/events.rs` emits the same ones. */
const EVENTS = { mailArrived: 'mail-arrived' } as const

/** Calls `onArrive` with every batch of new mail, newest first. Returns the unsubscribe. A no-op in a plain browser. */
export function onMailArrived(onArrive: (messages: Message[]) => void): () => void {
  if (!isTauri()) return () => {}
  const stop = listen<Message[]>(EVENTS.mailArrived, (event) => onArrive(event.payload))
  return () => void stop.then((unlisten) => unlisten())
}
