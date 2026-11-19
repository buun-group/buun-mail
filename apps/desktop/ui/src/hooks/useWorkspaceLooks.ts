import { useCallback, useState } from 'react'

import { STORAGE_KEYS, WORKSPACE_IMAGE_MAX_BYTES, WORKSPACE_IMAGE_PX } from '../constants/ui'

/** How one workspace looks, chosen in settings. Overrides the routing file's `icon` on this computer. */
export type WorkspaceLook = { kind: 'glyph'; key: string } | { kind: 'image'; src: string }

export type WorkspaceLooks = Record<string, WorkspaceLook>

function load(): WorkspaceLooks {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.looks)
    const parsed: unknown = raw === null ? {} : JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? (parsed as WorkspaceLooks) : {}
  } catch {
    return {}
  }
}

function save(looks: WorkspaceLooks): void {
  try {
    localStorage.setItem(STORAGE_KEYS.looks, JSON.stringify(looks))
  } catch {
    // Storage can be off or full; the look still holds for this session.
  }
}

/** Shrinks a picked image to a square PNG data URL, cropped from the centre, so it stays a few kilobytes. */
export async function shrinkImage(file: File): Promise<string> {
  if (file.size > WORKSPACE_IMAGE_MAX_BYTES) throw new Error('That image is over 5 MB. Pick a smaller one.')
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = WORKSPACE_IMAGE_PX
  canvas.height = WORKSPACE_IMAGE_PX
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('This window cannot draw images.')
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, WORKSPACE_IMAGE_PX, WORKSPACE_IMAGE_PX)
  bitmap.close()
  return canvas.toDataURL('image/png')
}

/** Every workspace's chosen look, remembered on this computer. `set(id, null)` goes back to the routing file's. */
export function useWorkspaceLooks(): { looks: WorkspaceLooks; set: (id: string, look: WorkspaceLook | null) => void } {
  const [looks, setLooks] = useState<WorkspaceLooks>(load)
  const set = useCallback((id: string, look: WorkspaceLook | null) => {
    setLooks((current) => {
      const next = { ...current }
      if (look === null) delete next[id]
      else next[id] = look
      save(next)
      return next
    })
  }, [])
  return { looks, set }
}
