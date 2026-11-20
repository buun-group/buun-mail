import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { attachmentData, openAttachment } from '../../api/client'
import type { Attachment } from '../../api/types'
import { IconClose, IconExternal } from '../../icons'
import { canOpen, previewKind } from '../../lib/attachments'
import { toast } from '../../lib/feedback'
import { readableSize } from '../../lib/size'
import { cancelSmoothly, closeDialog } from '../../lib/motion'

interface AttachmentPreviewProps {
  messageId: string
  file: Attachment
  onSave: () => void
  onClose: () => void
}

/**
 * One attachment in a window over the mail: a picture or text shown as it is, anything else described; Open hands a
 * document to the computer's own app (never a program or script), Save keeps it where the person chooses.
 */
export function AttachmentPreview({ messageId, file, onSave, onClose }: AttachmentPreviewProps): ReactNode {
  const { t } = useTranslation('mail')
  const dialog = useRef<HTMLDialogElement | null>(null)
  const kind = previewKind(file.mime)
  const [content, setContent] = useState<{ kind: 'image' | 'text'; value: string } | { kind: 'error'; value: string } | null>(null)

  useEffect(() => {
    const element = dialog.current
    if (element !== null && !element.open) element.showModal()
  }, [])

  useEffect(() => {
    if (kind === null) return
    let current = true
    attachmentData(messageId, file.index)
      .then((data) => {
        if (!current) return
        if (kind === 'image') setContent({ kind, value: `data:${data.mime};base64,${data.base64}` })
        else setContent({ kind, value: new TextDecoder().decode(Uint8Array.from(atob(data.base64), (char) => char.charCodeAt(0))) })
      })
      .catch((error: unknown) => {
        if (current) setContent({ kind: 'error', value: error instanceof Error ? error.message : String(error) })
      })
    return () => {
      current = false
    }
  }, [messageId, file.index, kind])

  const openable = canOpen(file.name)
  return (
    <dialog ref={dialog} className="preview" aria-labelledby="preview-title" onClose={onClose} onCancel={cancelSmoothly}>
      <header className="preview__head">
        <div className="preview__title">
          <h2 id="preview-title">{file.name}</h2>
          <span>{readableSize(file.size)}</span>
        </div>
        <button type="button" className="preview__close" aria-label={t('attachments.close')} onClick={() => closeDialog(dialog.current)}>
          <IconClose aria-hidden="true" />
        </button>
      </header>
      <div className="preview__body">
        {kind === null ? (
          <p className="preview__note">{openable ? t('attachments.noPreview') : t('attachments.notOpenable')}</p>
        ) : content === null ? (
          <p className="preview__note">{t('attachments.loading')}</p>
        ) : content.kind === 'image' ? (
          <img className="preview__image" src={content.value} alt={file.name} />
        ) : content.kind === 'text' ? (
          <pre className="preview__text">{content.value}</pre>
        ) : (
          <p className="preview__note">{content.value}</p>
        )}
      </div>
      <footer className="preview__foot">
        {openable && (
          <button
            type="button"
            className="preview__button"
            onClick={() => void openAttachment(messageId, file.index).catch((error: unknown) => toast({ text: t('attachments.openFailed'), detail: error instanceof Error ? error.message : String(error), tone: 'problem' }))}
          >
            <IconExternal aria-hidden="true" />
            {t('attachments.open')}
          </button>
        )}
        <button type="button" className="preview__button preview__button--primary" onClick={onSave}>
          {t('attachments.saveButton')}
        </button>
      </footer>
    </dialog>
  )
}
