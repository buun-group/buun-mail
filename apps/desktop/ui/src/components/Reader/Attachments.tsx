import type { ReactNode } from 'react'
import type { IconType } from 'react-icons'
import { useTranslation } from 'react-i18next'

import { isTauri } from '@tauri-apps/api/core'

import { saveAttachment } from '../../api/client'
import type { Attachment } from '../../api/types'
import { IconAttachment, IconCalendarFile, IconFile, IconFileImage, IconFilePdf, IconFileZip } from '../../icons'
import { toast } from '../../lib/feedback'

/** A glyph for an attachment from its type. */
function glyphFor(mime: string): IconType {
  if (mime === 'application/pdf') return IconFilePdf
  if (mime.startsWith('image/')) return IconFileImage
  if (/zip|compressed|tar|gzip/u.test(mime)) return IconFileZip
  if (mime === 'text/calendar') return IconCalendarFile
  return IconFile
}

/** A size in the units people read: 48 KB, 1.2 MB. */
export function readableSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** The files a message carries, pictures shown in its body left out; clicking one saves it where the person chooses. */
export function Attachments({ messageId, attachments }: { messageId: string; attachments: Attachment[] }): ReactNode {
  const { t } = useTranslation('mail')
  const files = attachments.filter((item) => !item.inline)
  if (files.length === 0) return null
  const keep = (file: Attachment): void => {
    saveAttachment(messageId, file.index, file.name)
      .then((path) => {
        if (path !== null) toast({ text: t('attachments.saved'), detail: path, tone: 'done', glyph: IconAttachment })
        else if (!isTauri()) toast({ text: t('attachments.desktopOnly'), tone: 'info' })
      })
      .catch((error: unknown) => toast({ text: t('attachments.failed'), detail: error instanceof Error ? error.message : String(error), tone: 'problem' }))
  }
  return (
    <section className="attachments" aria-label={t('attachments.label', { count: files.length })}>
      <h3 className="attachments__title">
        <IconAttachment aria-hidden="true" />
        {t('attachments.label', { count: files.length })}
      </h3>
      <ul className="attachments__list">
        {files.map((file) => {
          const Glyph = glyphFor(file.mime)
          return (
            <li key={file.index}>
              <button type="button" className="attachment" aria-label={t('attachments.save', { name: file.name })} onClick={() => keep(file)}>
                <Glyph aria-hidden="true" className="attachment__glyph" />
                <span className="attachment__words">
                  <span className="attachment__name">{file.name}</span>
                  <span className="attachment__size">{readableSize(file.size)}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
