import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { Message, Workspace } from '../../api/types'
import { INBOX_LABEL } from '../../constants/ui'
import type { BulkActions } from '../../hooks/useMessageActions'
import { IconArchive, IconClose, IconDelete, IconFolder, IconInbox, IconMarkRead, IconMove, IconPutBack, IconStar, IconStarred, IconUnread } from '../../icons'
import { ContextMenu } from '../ContextMenu/ContextMenu'
import type { MenuRequest } from '../ContextMenu/ContextMenu'
import { TipButton } from '../Tooltip/TipButton'

interface SelectionBarProps {
  selected: Message[]
  total: number
  workspace: Workspace | undefined
  bulk: BulkActions
  onSelectAll: () => void
  onClear: () => void
}

/**
 * In place of the list's title while messages are selected: how many, Select all, and what can be done to all of them
 * at once. In the trash it offers Move back and Delete forever; elsewhere Archive and Move to trash.
 */
export function SelectionBar({ selected, total, workspace, bulk, onSelectAll, onClear }: SelectionBarProps): ReactNode {
  const { t } = useTranslation(['mail', 'common'])
  const [menu, setMenu] = useState<MenuRequest | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const done = (run: () => void) => () => {
    run()
    onClear()
  }
  const inTrash = selected.every((message) => message.shelf === 'trashed')
  const archived = selected.every((message) => message.shelf === 'archived')
  const anyUnread = selected.some((message) => message.unread)
  const allStarred = selected.every((message) => message.starred)
  const tools = [
    inTrash || archived
      ? { id: 'back', label: t('selection.putBack'), Glyph: IconPutBack, run: done(() => bulk.shelve(selected, 'active')) }
      : { id: 'archive', label: t('selection.archive'), Glyph: IconArchive, run: done(() => bulk.shelve(selected, 'archived')) },
    inTrash
      ? { id: 'delete', label: t('selection.deleteForever'), Glyph: IconDelete, run: done(() => bulk.deleteForever(selected)) }
      : { id: 'trash', label: t('selection.trash'), Glyph: IconDelete, run: done(() => bulk.shelve(selected, 'trashed')) },
    anyUnread ? { id: 'read', label: t('selection.read'), Glyph: IconMarkRead, run: () => bulk.setRead(selected, true) } : { id: 'unread', label: t('selection.unread'), Glyph: IconUnread, run: () => bulk.setRead(selected, false) },
    allStarred ? { id: 'unstar', label: t('selection.unstar'), Glyph: IconStarred, run: () => bulk.setStarred(selected, false) } : { id: 'star', label: t('selection.star'), Glyph: IconStar, run: () => bulk.setStarred(selected, true) },
  ]
  return (
    <div className="selection-bar" role="toolbar" aria-label={t('selection.label')}>
      <input type="checkbox" className="row-check" checked={selected.length === total} aria-label={t('selection.selectAll')} onChange={() => (selected.length === total ? onClear() : onSelectAll())} />
      <span className="selection-bar__count">{t('selection.count', { count: selected.length })}</span>
      <div className="selection-bar__tools">
        {tools.map(({ id, label, Glyph, run }) => (
          <TipButton key={id} tip={label} className="selection-bar__tool" aria-label={label} onClick={run}>
            <Glyph aria-hidden="true" />
          </TipButton>
        ))}
        {workspace !== undefined && !inTrash && (
          <TipButton
            tip={t('selection.moveTo')}
            className="selection-bar__tool"
            aria-label={t('selection.moveTo')}
            aria-haspopup="menu"
            onClick={(event) => {
              const box = event.currentTarget.getBoundingClientRect()
              setMenu({
                x: box.left,
                y: box.bottom + 6,
                label: t('selection.moveTo'),
                items: workspace.folders.map((folder) => ({
                  id: folder.name ?? 'inbox',
                  label: t('selection.moveToFolder', { folder: folder.name ?? t(INBOX_LABEL) }),
                  glyph: folder.name === null ? IconInbox : IconFolder,
                  onSelect: () => {
                    bulk.move(selected, { workspace: workspace.id, folder: folder.name })
                    onClear()
                  },
                })),
              })
            }}
          >
            <IconMove aria-hidden="true" />
          </TipButton>
        )}
        <TipButton tip={`${t('selection.clear')} (Esc)`} className="selection-bar__tool" aria-label={t('selection.clear')} onClick={onClear}>
          <IconClose aria-hidden="true" />
        </TipButton>
      </div>
      {menu !== null && <ContextMenu request={menu} onClose={closeMenu} />}
    </div>
  )
}
