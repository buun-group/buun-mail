import { useCallback, useState } from 'react'
import type { IconType } from 'react-icons'
import { useTranslation } from 'react-i18next'
import { isTauri as isDesktop } from '@tauri-apps/api/core'

import { deleteMessagesForever, emptyTrash, exportMessages, moveMessage, setMessagesStarred, setMessagesUnread, shelveMessages, snoozeMessages } from '../api/client'
import type { Message, Place, Shelf } from '../api/types'
import type { Confirmation } from '../components/Confirm/Confirm'
import type { MenuItem } from '../components/ContextMenu/ContextMenu'
import { INBOX_LABEL } from '../constants/ui'
import type { ComposeMode } from '../lib/compose'
import type { ExportFormat } from '../constants/ui'
import { IconArchive, IconCopy, IconExport, IconSnooze, IconForward, IconReply, IconReplyAll, IconDelete, IconFolder, IconInbox, IconMarkRead, IconPutBack, IconStar, IconStarred } from '../icons'
import { copyWithToast } from '../lib/copy'
import { snoozeTime } from '../lib/snooze'
import { formatFull } from '../lib/time'
import { toast } from '../lib/feedback'
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
  /** Snoozes messages until `until`, or wakes them now with null, with Undo. */
  snooze: (messages: Message[], until: Date | null) => void
  /** Asks where, then saves the message as `format`. */
  exportAs: (message: Message, format: ExportFormat) => void
  /** The same changes for several messages at once, from the list's selection. */
  bulk: BulkActions
  confirmation: Confirmation | null
  closeConfirmation: () => void
}

/** Changes for several messages at once. Each takes the messages as the list holds them. */
export interface BulkActions {
  shelve: (messages: Message[], shelf: Shelf) => void
  setRead: (messages: Message[], read: boolean) => void
  setStarred: (messages: Message[], starred: boolean) => void
  move: (messages: Message[], place: Place) => void
  /** Asks first, then deletes them for good. */
  deleteForever: (messages: Message[]) => void
}

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/**
 * Everything a person can do to a message: read state, stars, archive, trash, moves and deleting for good. Each change
 * updates the list, opens the next message when the open one leaves, and says what happened, with Undo where it can.
 */
export function useMessageActions(mailbox: Mailbox, workspaceName: (id: string) => string, writing?: { canReply: (message: Message) => boolean; canForward: boolean; start: (mode: ComposeMode, message: Message) => void }): MessageActions {
  const { t } = useTranslation(['mail', 'common'])
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const say = (text: string, glyph?: IconType, undo?: () => void): void => {
    toast({ text, tone: 'done', ...(glyph === undefined ? {} : { glyph }), ...(undo === undefined ? {} : { undo }) })
  }
  const fail = (error: unknown): void => {
    toast({ text: t('actions.failed'), detail: reason(error), tone: 'problem' })
  }

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

  const exportAs = (message: Message, format: ExportFormat): void => {
    // A file name from the subject: letters, digits, spaces and dashes, never a path.
    const name = message.subject.replace(/[^\p{L}\p{N} -]+/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, 60) || 'message'
    exportMessages([message.id], format, name, t('export.fileType', { format: t(`export.${format}`) }))
      .then((path) => {
        if (path === null) {
          if (!isDesktop()) toast({ text: t('export.desktopOnly'), tone: 'info' })
          return
        }
        toast({ text: t('export.saved', { count: 1 }), detail: path, tone: 'done', glyph: IconExport })
      })
      .catch((error: unknown) => toast({ text: t('export.failed'), detail: reason(error), tone: 'problem' }))
  }

  const snooze = (messages: Message[], until: Date | null): void => {
    const first = messages[0]
    if (first === undefined) return
    const ids = messages.map((message) => message.id)
    if (until !== null && mailbox.view !== 'snoozed' && messages.some((message) => message.id === mailbox.selected?.message.id)) mailbox.stepPast(first.id)
    snoozeMessages(ids, until)
      .then(() => {
        mailbox.refresh()
        const words = until === null ? t('snooze.woken', { count: ids.length }) : t('snooze.snoozed', { count: ids.length, when: formatFull(until.toISOString()) })
        say(words, IconSnooze, () => {
          Promise.all(messages.map((message) => snoozeMessages([message.id], message.snoozedUntil === null ? null : new Date(message.snoozedUntil))))
            .then(mailbox.refresh)
            .catch(fail)
        })
      })
      .catch(fail)
  }

  const bulk: BulkActions = {
    shelve: (messages, shelf) => {
      const ids = messages.map((message) => message.id)
      // Undo puts each back where it was, grouped by its old shelf.
      const before = new Map<Shelf, string[]>()
      messages.forEach((message) => before.set(message.shelf, [...(before.get(message.shelf) ?? []), message.id]))
      const words = shelf === 'archived' ? t('actions.archived', { count: ids.length }) : shelf === 'trashed' ? t('actions.trashed', { count: ids.length }) : t('actions.restored', { count: ids.length })
      shelveMessages(ids, shelf)
        .then(() => {
          mailbox.refresh()
          say(words, shelf === 'archived' ? IconArchive : shelf === 'trashed' ? IconDelete : IconPutBack, () => {
            Promise.all([...before].map(([was, back]) => shelveMessages(back, was)))
              .then(mailbox.refresh)
              .catch(fail)
          })
        })
        .catch(fail)
    },
    setRead: (messages, read) => {
      setMessagesUnread(
        messages.map((message) => message.id),
        !read,
      )
        .then((changed) => {
          mailbox.update(changed)
          mailbox.refresh()
        })
        .catch(fail)
    },
    setStarred: (messages, starred) => {
      setMessagesStarred(
        messages.map((message) => message.id),
        starred,
      )
        .then((changed) => {
          mailbox.update(changed)
          if (mailbox.view === 'starred') mailbox.refresh()
        })
        .catch(fail)
    },
    move: (messages, place) => {
      Promise.all(messages.map((message) => moveMessage(message.id, place)))
        .then(() => {
          mailbox.refresh()
          say(t('actions.movedMany', { count: messages.length, folder: placeName(place) }), IconFolder, () => {
            Promise.all(messages.map((message) => moveMessage(message.id, { workspace: message.workspace, folder: message.folder })))
              .then(mailbox.refresh)
              .catch(fail)
          })
        })
        .catch(fail)
    },
    deleteForever: (messages) =>
      setConfirmation({
        title: t('actions.confirmDeleteManyTitle', { count: messages.length }),
        body: t('actions.confirmEmptyBody', { count: messages.length }),
        action: t('actions.confirmDelete'),
        run: () => {
          deleteMessagesForever(messages.map((message) => message.id))
            .then((count) => {
              mailbox.refresh()
              say(t('actions.deleted', { count }), IconDelete)
            })
            .catch(fail)
        },
      }),
  }

  const menu = (message: Message): MenuItem[] => {
    const folders = mailbox.workspaces.find((workspace) => workspace.id === message.workspace)?.folders ?? []
    const elsewhere = folders.filter((folder) => folder.name !== message.folder)
    const reply: MenuItem[] =
      writing === undefined
        ? []
        : [
            { id: 'reply', label: t('actions.reply'), glyph: IconReply, onSelect: () => writing.start('reply', message), ...(writing.canReply(message) ? {} : { disabledReason: t('reader.needsSending', { domain: message.to.split('@')[1] ?? message.to }) }), separated: true },
            { id: 'reply-all', label: t('actions.replyAll'), glyph: IconReplyAll, onSelect: () => writing.start('replyAll', message), ...(writing.canReply(message) ? {} : { disabledReason: t('reader.needsSending', { domain: message.to.split('@')[1] ?? message.to }) }) },
            { id: 'forward', label: t('actions.forward'), glyph: IconForward, onSelect: () => writing.start('forward', message), ...(writing.canForward ? {} : { disabledReason: t('reader.needsSending', { domain: message.to.split('@')[1] ?? message.to }) }) },
          ]
    const common: MenuItem[] = [
      { id: 'open', label: t('actions.open'), glyph: IconMarkRead, onSelect: () => mailbox.select(message) },
      { id: 'read', label: message.unread ? t('actions.markRead') : t('actions.markUnread'), glyph: message.unread ? IconMarkRead : IconInbox, onSelect: () => toggleRead(message) },
      { id: 'star', label: message.starred ? t('actions.unstar') : t('actions.star'), glyph: message.starred ? IconStarred : IconStar, onSelect: () => toggleStar(message) },
      ...reply,
      ...(message.snoozedUntil === null
        ? [
            { id: 'snooze-tomorrow', label: t('snooze.menuTomorrow'), glyph: IconSnooze, onSelect: () => snooze([message], snoozeTime('tomorrow')), separated: true },
            { id: 'snooze-week', label: t('snooze.menuNextWeek'), glyph: IconSnooze, onSelect: () => snooze([message], snoozeTime('nextWeek')) },
          ]
        : [{ id: 'wake', label: t('snooze.wake'), glyph: IconSnooze, onSelect: () => snooze([message], null), separated: true }]),
    ]
    const copy: MenuItem[] = [
      { id: 'copy-sender', label: t('actions.copySender'), glyph: IconCopy, onSelect: () => void copyWithToast(message.from), separated: true },
      { id: 'copy-subject', label: t('actions.copySubject'), glyph: IconCopy, onSelect: () => void copyWithToast(message.subject) },
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

  return { menu, toggleRead, toggleStar, archive, trash, putBack, move, deleteForever, emptyTrash: confirmEmptyTrash, exportAs, snooze, bulk, confirmation, closeConfirmation }
}
