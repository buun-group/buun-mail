/**
 * Whether the app can send as `address`: true once a sending integration that covers its domain is connected. None
 * is wired up yet, so replying stays off and says why; this is the one place that changes when sending arrives.
 */
export function canSendAs(_address: string): boolean {
  return false
}

/** The domain of an address, for saying which domain needs a sending integration. */
export function domainOf(address: string): string {
  return address.split('@')[1] ?? address
}
