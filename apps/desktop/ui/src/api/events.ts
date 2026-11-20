import { isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

import type { Message, Reminder } from './types'

/** Event names. `src-tauri/src/events.rs` emits the same ones. */
const EVENTS = { mailArrived: 'mail-arrived', mailChanged: 'mail-changed', reminderDue: 'reminder-due' } as const

/** Calls `onArrive` with every batch of new mail, newest first. Returns the unsubscribe. A no-op in a plain browser. */
export function onMailArrived(onArrive: (messages: Message[]) => void): () => void {
  if (!isTauri()) return () => {}
  const stop = listen<Message[]>(EVENTS.mailArrived, (event) => onArrive(event.payload))
  return () => void stop.then((unlisten) => unlisten())
}

/** Calls `onChange` whenever mail, tags, rules or read state change outside the window, such as by an agent. */
export function onMailChanged(onChange: () => void): () => void {
  if (!isTauri()) return () => {}
  const stop = listen(EVENTS.mailChanged, () => onChange())
  return () => void stop.then((unlisten) => unlisten())
}

/** Calls `onDue` when a follow-up reminder falls due with no reply. */
export function onReminderDue(onDue: (reminder: Reminder) => void): () => void {
  if (!isTauri()) return () => {}
  const stop = listen<Reminder>(EVENTS.reminderDue, (event) => onDue(event.payload))
  return () => void stop.then((unlisten) => unlisten())
}
