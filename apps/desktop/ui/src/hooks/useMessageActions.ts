import { useCallback, useState } from 'react'
import type { IconType } from 'react-icons'
import { useTranslation } from 'react-i18next'

import { deleteMessagesForever, emptyTrash, moveMessage, setMessagesStarred, setMessagesUnread, shelveMessages } from '../api/client'
import type { Message, Place, Shelf } from '../api/types'
import type { Confirmation } from '../components/Confirm/Confirm'
import type { MenuItem } from '../components/ContextMenu/ContextMenu'
import type { NoticeItem } from '../components/Notice/Notice'
import { INBOX_LABEL } from '../constants/ui'
import { IconArchive, IconCopy, IconDelete, IconFolder, IconInbox, IconMarkRead, IconPutBack, IconStar, IconStarred } from '../icons'
import { copyText } from '../lib/clipboard'
import type { Mailbox } from './useMailbox'

export interface MessageActions {
  /** The right-click menu for one message. */
  menu: (message: Message) => MenuItem[]
  toggleRead: (message: Message) => void
  toggleStar: (message: Message) => void
  archive: (message: Message) => void
  trash: (message: Message) => void
  putBack: (message: Message) => void
  move: (message: Message, place: Place) => void
  /** Asks first, then deletes for good. */
  deleteForever: (message: Message) => void
  /** Asks first, then empties the trash. */
  emptyTrash: (count: number) => void
  notice: NoticeItem | null
  dismissNotice: () => void
  confirmation: Confirmation | null
  closeConfirmation: () => void
}

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/**
 * Everything a person can do to a message: read state, stars, archive, trash, moves and deleting for good. Each change
 * updates the list, opens the next message when the open one leaves, and says what happened, with Undo where it can.
 */
export function useMessageActions(mailbox: Mailbox, workspaceName: (id: string) => string): MessageActions {
  const { t } = useTranslation(['mail', 'common'])
  const [notice, setNotice] = useState<NoticeItem | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const say = (text: string, glyph?: IconType, undo?: () => void): void => setNotice({ id: Date.now(), text, ...(glyph === undefined ? {} : { glyph }), ...(undo === undefined ? {} : { undo }) })
  const fail = (error: unknown): void => say(reason(error))
  const dismissNotice = useCallback(() => setNotice(null), [])
  const closeConfirmation = useCallback(() => setConfirmation(null), [])

  const placeName = (place: Place): string => `${workspaceName(place.workspace)}, ${place.folder ?? t(INBOX_LABEL)}`

  /** True when a message on `shelf` no longer belongs in the list on screen. */
  const leavesList = (shelf: Shelf, starred: boolean): boolean => {
    if (mailbox.view === null) return shelf !== 'active'
    if (mailbox.view === 'archive') return shelf !== 'archived'
    if (mailbox.view === 'trash') return shelf !== 'trashed'
    return shelf === 'trashed' || !starred
  }

  const shelve = (message: Message, shelf: Shelf, done: string, glyph: IconType): void => {
    const was = message.shelf
    if (leavesList(shelf, message.starred)) mailbox.stepPast(message.id)
    shelveMessages([message.id], shelf)
      .then(() => {
        mailbox.refresh()
        say(done, glyph, () => {
          shelveMessages([message.id], was).then(mailbox.refresh).catch(fail)
        })
      })
      .catch(fail)
  }

  const toggleRead = (message: Message): void => {
    setMessagesUnread([message.id], !message.unread)
      .then((changed) => {
        mailbox.update(changed)
        mailbox.refresh()
      })
      .catch(fail)
  }

  const toggleStar = (message: Message): void => {
    if (mailbox.view === 'starred' && message.starred) mailbox.stepPast(message.id)
    setMessagesStarred([message.id], !message.starred)
      .then((changed) => {
        mailbox.update(changed)
        if (mailbox.view === 'starred') mailbox.refresh()
      })
      .catch(fail)
  }

  const archive = (message: Message): void => shelve(message, 'archived', t('actions.archived', { count: 1 }), IconArchive)
  const trash = (message: Message): void => shelve(message, 'trashed', t('actions.trashed', { count: 1 }), IconDelete)
  const putBack = (message: Message): void => shelve(message, 'active', t('actions.putBackDone', { folder: placeName(message) }), IconPutBack)

  const move = (message: Message, place: Place): void => {
    mailbox.stepPast(message.id)
    const from = { workspace: message.workspace, folder: message.folder }
    moveMessage(message.id, place)
      .then(() => {
        mailbox.refresh()
        say(t('actions.moved', { folder: placeName(place) }), IconFolder, () => {
          moveMessage(message.id, from).then(mailbox.refresh).catch(fail)
        })
      })
      .catch(fail)
  }

  const deleteForever = (message: Message): void =>
    setConfirmation({
      title: t('actions.confirmDeleteTitle'),
      body: t('actions.confirmDeleteBody', { subject: message.subject }),
      action: t('actions.confirmDelete'),
      run: () => {
        mailbox.stepPast(message.id)
        deleteMessagesForever([message.id])
          .then((count) => {
            mailbox.refresh()
            say(t('actions.deleted', { count }), IconDelete)
          })
          .catch(fail)
      },
    })

  const confirmEmptyTrash = (count: number): void =>
    setConfirmation({
      title: t('actions.confirmEmptyTitle'),
      body: t('actions.confirmEmptyBody', { count }),
      action: t('actions.confirmEmpty'),
      run: () => {
        emptyTrash()
          .then((deleted) => {
            mailbox.refresh()
            say(t('actions.deleted', { count: deleted }), IconDelete)
          })
          .catch(fail)
      },
    })

  const menu = (message: Message): MenuItem[] => {
    const folders = mailbox.workspaces.find((workspace) => workspace.id === message.workspace)?.folders ?? []
    const elsewhere = folders.filter((folder) => folder.name !== message.folder)
    const common: MenuItem[] = [
      { id: 'open', label: t('actions.open'), glyph: IconMarkRead, onSelect: () => mailbox.select(message) },
      { id: 'read', label: message.unread ? t('actions.markRead') : t('actions.markUnread'), glyph: message.unread ? IconMarkRead : IconInbox, onSelect: () => toggleRead(message) },
      { id: 'star', label: message.starred ? t('actions.unstar') : t('actions.star'), glyph: message.starred ? IconStarred : IconStar, onSelect: () => toggleStar(message) },
    ]
    const copy: MenuItem[] = [
      { id: 'copy-sender', label: t('actions.copySender'), glyph: IconCopy, onSelect: () => void copyText(message.from), separated: true },
      { id: 'copy-subject', label: t('actions.copySubject'), glyph: IconCopy, onSelect: () => void copyText(message.subject) },
    ]
    if (message.shelf === 'trashed') {
      return [
        ...common,
        { id: 'put-back', label: t('actions.putBack', { folder: placeName(message) }), glyph: IconPutBack, onSelect: () => putBack(message), separated: true },
        { id: 'delete', label: t('actions.deleteForever'), glyph: IconDelete, onSelect: () => deleteForever(message) },
        ...copy,
      ]
    }
    const moves: MenuItem[] =
      message.shelf === 'active'
        ? elsewhere.map((folder, index) => ({
            id: `move-${folder.name ?? 'inbox'}`,
            label: t('actions.moveTo', { folder: folder.name ?? t(INBOX_LABEL) }),
            glyph: folder.name === null ? IconInbox : IconFolder,
            onSelect: () => move(message, { workspace: message.workspace, folder: folder.name }),
            separated: index === 0,
          }))
        : []
    return [
      ...common,
      message.shelf === 'archived'
        ? { id: 'put-back', label: t('actions.putBack', { folder: placeName(message) }), glyph: IconPutBack, onSelect: () => putBack(message), separated: true }
        : { id: 'archive', label: t('actions.archive'), glyph: IconArchive, onSelect: () => archive(message), separated: true },
      { id: 'trash', label: t('actions.trash'), glyph: IconDelete, onSelect: () => trash(message) },
      ...moves,
      ...copy,
    ]
  }

  return { menu, toggleRead, toggleStar, archive, trash, putBack, move, deleteForever, emptyTrash: confirmEmptyTrash, notice, dismissNotice, confirmation, closeConfirmation }
}
