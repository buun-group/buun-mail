/** Kinds the system may open with its own app. Mirrors `OPENABLE` in the Rust side, which has the final say. */
const OPENABLE = new Set(['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'txt', 'md', 'csv', 'json', 'ics', 'rtf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'zip'])

/** True when the attachment's name ends in a kind the system may open: documents and pictures, never programs. */
export function canOpen(name: string): boolean {
  const extension = name.includes('.') ? (name.split('.').pop() ?? '').toLowerCase() : ''
  return OPENABLE.has(extension)
}

/** How an attachment can be shown inside the app: as a picture, as text, or not at all. */
export function previewKind(mime: string): 'image' | 'text' | null {
  if (/^image\/(png|jpeg|gif|webp|svg\+xml)$/u.test(mime)) return mime === 'image/svg+xml' ? null : 'image'
  if (mime.startsWith('text/') || mime === 'application/json' || mime === 'application/ics') return 'text'
  return null
}
