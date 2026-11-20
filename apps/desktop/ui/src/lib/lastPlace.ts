import type { MailView, Place } from '../api/types'
import { STORAGE_KEYS } from '../constants/ui'

/** Where the person was: a folder or a view, and the message open in it. */
export interface SavedPlace {
  place: Place | null
  view: MailView | null
  selectedId: string | null
}

const VIEWS: readonly MailView[] = ['all', 'starred', 'snoozed', 'archive', 'trash', 'drafts', 'contacts']

/** The place saved when the app last closed, or null when there is none or it cannot be read. */
export function readLastPlace(): SavedPlace | null {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEYS.lastPlace) ?? 'null')
    if (typeof saved !== 'object' || saved === null) return null
    const { place, view, selectedId } = saved as Partial<SavedPlace>
    const okPlace = place !== null && typeof place === 'object' && typeof place?.workspace === 'string' && (place.folder === null || typeof place.folder === 'string')
    return {
      place: okPlace ? place : null,
      view: VIEWS.find((item) => item === view) ?? null,
      selectedId: typeof selectedId === 'string' ? selectedId : null,
    }
  } catch {
    return null
  }
}

/** Saves where the person is, or forgets it with null. Storage can be off; then nothing is remembered. */
export function writeLastPlace(saved: SavedPlace | null): void {
  try {
    if (saved === null) localStorage.removeItem(STORAGE_KEYS.lastPlace)
    else localStorage.setItem(STORAGE_KEYS.lastPlace, JSON.stringify(saved))
  } catch {
    // Not remembered this time.
  }
}
