import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { deleteWorkspace } from '../api/client'
import { IconDelete } from '../icons'
import type { Confirmation } from '../components/Confirm/Confirm'
import { toast } from '../lib/feedback'

export interface WorkspaceDeletion {
  /** Asks before deleting this workspace from the routing file. */
  ask: (workspace: { id: string; name: string }) => void
  /** The open question, for `Confirm`. */
  confirmation: Confirmation | null
  close: () => void
}

/**
 * Deleting a workspace, from the sidebar's right-click menu or Settings: a dialog says what happens to its mail first,
 * then a toast says how many messages were filed again. `onDeleted` runs once the routing file no longer has it.
 */
export function useWorkspaceDeletion(onDeleted: (id: string) => void): WorkspaceDeletion {
  const { t } = useTranslation('settings')
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const close = useCallback(() => setConfirmation(null), [])
  const ask = useCallback(
    ({ id, name }: { id: string; name: string }) =>
      setConfirmation({
        title: t('workspaces.deleteTitle', { name }),
        body: t('workspaces.deleteBody'),
        action: t('workspaces.deleteAction'),
        run: () => {
          deleteWorkspace(id)
            .then((moved) => {
              toast({ text: t('workspaces.deleted', { name }), detail: t('workspaces.deletedDetail', { count: moved }), tone: 'done', glyph: IconDelete })
              onDeleted(id)
            })
            .catch((reason: unknown) => toast({ text: t('workspaces.deleteFailed', { name }), detail: reason instanceof Error ? reason.message : String(reason), tone: 'problem' }))
        },
      }),
    [t, onDeleted],
  )
  return { ask, confirmation, close }
}
