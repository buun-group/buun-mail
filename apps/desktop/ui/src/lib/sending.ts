import type { Sendable } from '../api/types'

/** The domain of an address, lowercased. */
export function domainOf(address: string): string {
  return (address.split('@')[1] ?? address).toLowerCase()
}

/** Whether a connected sender can send as `address`: some sender covers its domain and it is verified there. */
export function canSendAs(address: string, sendable: readonly Sendable[]): boolean {
  const domain = domainOf(address)
  return sendable.some((known) => known.domain === domain)
}

/** The signature for mail sent as `address`, or an empty string. */
export function signatureFor(address: string, sendable: readonly Sendable[]): string {
  return sendable.find((known) => known.domain === domainOf(address))?.signature ?? ''
}
