import i18n from '../i18n'
import { IconCopy } from '../icons'
import { copyText } from './clipboard'
import { toast } from './feedback'

/** How much of the copied text a toast repeats. */
const SHOWN = 60

/** Copies text and says so in a toast, with what was copied, or that the clipboard is not available. */
export async function copyWithToast(text: string, done = i18n.t('mail:copy.copied')): Promise<boolean> {
  const copied = await copyText(text)
  if (copied) toast({ text: done, detail: text.length > SHOWN ? `${text.slice(0, SHOWN)}...` : text, tone: 'done', glyph: IconCopy })
  else toast({ text: i18n.t('mail:actions.copyFailed'), tone: 'problem' })
  return copied
}
