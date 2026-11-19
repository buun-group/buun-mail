/** Copies text. Resolves false when the clipboard is unavailable, so a caller can say so instead of failing quietly. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
