import { useEffect, useLayoutEffect, useRef } from 'react'

import type { Message } from '../api/types'
import type { ComposeMode } from '../lib/compose'
import type { MessageActions } from './useMessageActions'

/** True when a key press belongs to whatever has focus: a field, an open dialog or menu, or a modifier chord. */
export function isBusy(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return true
  const target = event.target
  if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"], [role="menu"], [role="listbox"]') !== null) return true
  return document.querySelector('dialog[open]') !== null
}

/**
 * The single keys a good mail client has, on the open message: E archive (or put back), # or Delete to the trash (or
 * delete for good from it), U read or unread, S star, J and K the next and previous message, and Escape back to the
 * list when the reading pane is off. Slash goes to the search box; C writes a new message, and R, A and F reply,
 * reply all or forward the open one.
 */
export function useMailKeys(
  selected: Message | null,
  messages: Message[],
  onSelect: (message: Message) => void,
  actions: MessageActions,
  onBack: (() => void) | null,
  writing: { compose: () => void; reply: (mode: ComposeMode, message: Message) => void },
): void {
  // The latest values, read when a key lands, so the listener is added once.
  const latest = useRef({ selected, messages, onSelect, actions, onBack, writing })
  useLayoutEffect(() => {
    latest.current = { selected, messages, onSelect, actions, onBack, writing }
  })

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (isBusy(event)) return
      const { selected: open, messages: list, onSelect: select, actions: act, onBack: back, writing: write } = latest.current
      const step = (by: number): void => {
        const at = open === null ? -1 : list.findIndex((item) => item.id === open.id)
        const next = list[Math.min(Math.max(at + by, 0), list.length - 1)]
        if (next !== undefined) select(next)
      }
      const key = event.key
      if (key === '/') document.getElementById('search')?.focus()
      else if (key === 'c') write.compose()
      else if (key === 'j') step(1)
      else if (key === 'k') step(-1)
      else if (open === null) return
      else if (key === 'Escape' && back !== null) back()
      else if (key === 'e') (open.shelf === 'active' ? act.archive : act.putBack)(open)
      else if (key === '#' || key === 'Delete') (open.shelf === 'trashed' ? act.deleteForever : act.trash)(open)
      else if (key === 'u') act.toggleRead(open)
      else if (key === 's') act.toggleStar(open)
      else if (key === 'r') write.reply('reply', open)
      else if (key === 'a') write.reply('replyAll', open)
      else if (key === 'f') write.reply('forward', open)
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
