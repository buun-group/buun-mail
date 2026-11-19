import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { Message } from '../../api/types'
import { INBOX_LABEL } from '../../constants/ui'
import type { MessageActions } from '../../hooks/useMessageActions'
import { IconArchive, IconDelete, IconInbox, IconMarkRead, IconPutBack, IconStar, IconStarred } from '../../icons'
import { TipButton } from '../Tooltip/TipButton'

/**
 * The few things done most to a message, on its row: archive (or move back), trash (or delete for good), read state
 * and star. They show while the row is pointed at or focused, over its time, and never open the message.
 */
export function QuickActions({ message, actions }: { message: Message; actions: MessageActions }): ReactNode {
  const { t } = useTranslation(['mail', 'common'])
  const tools = [
    message.shelf === 'active'
      ? { id: 'archive', label: t('actions.archive'), Glyph: IconArchive, run: () => actions.archive(message) }
      : { id: 'put-back', label: t('actions.putBack', { folder: message.folder ?? t(INBOX_LABEL) }), Glyph: IconPutBack, run: () => actions.putBack(message) },
    message.shelf === 'trashed'
      ? { id: 'delete', label: t('actions.deleteForever'), Glyph: IconDelete, run: () => actions.deleteForever(message), danger: true }
      : { id: 'trash', label: t('actions.trash'), Glyph: IconDelete, run: () => actions.trash(message), danger: true },
    { id: 'read', label: message.unread ? t('actions.markRead') : t('actions.markUnread'), Glyph: message.unread ? IconMarkRead : IconInbox, run: () => actions.toggleRead(message) },
    { id: 'star', label: message.starred ? t('actions.unstar') : t('actions.star'), Glyph: message.starred ? IconStarred : IconStar, run: () => actions.toggleStar(message), on: message.starred },
  ]
  return (
    <div className="quick-actions" role="toolbar" aria-label={t('actions.menuLabel', { subject: message.subject })}>
      {tools.map(({ id, label, Glyph, run, ...rest }) => (
        <TipButton
          key={id}
          tip={label}
          className="quick-actions__tool"
          data-danger={'danger' in rest || undefined}
          data-on={'on' in rest ? rest.on : undefined}
          aria-label={label}
          onClick={(event) => {
            event.stopPropagation()
            run()
          }}
        >
          <Glyph aria-hidden="true" />
        </TipButton>
      ))}
    </div>
  )
}
