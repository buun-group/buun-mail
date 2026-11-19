import { useCallback, useEffect, useState } from 'react'

import { sendableDomains } from '../api/client'
import type { Sendable } from '../api/types'
import { canSendAs } from '../lib/sending'

export interface Sending {
  /** The domains mail can be sent from now, each with its sender's signature. */
  sendable: Sendable[]
  /** True when `address` can be sent as. */
  can: (address: string) => boolean
  /** True when any domain can send, so Compose is on. */
  any: boolean
  /** Reads the sendable domains again, after a sender changes. */
  refresh: () => void
}

/** What the app can send from, loaded at start and whenever Settings changes a sender. */
export function useSending(): Sending {
  const [sendable, setSendable] = useState<Sendable[]>([])
  const refresh = useCallback(() => {
    sendableDomains()
      .then(setSendable)
      .catch(() => setSendable([]))
  }, [])
  useEffect(refresh, [refresh])
  return { sendable, can: (address) => canSendAs(address, sendable), any: sendable.length > 0, refresh }
}
