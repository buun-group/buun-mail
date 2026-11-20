import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Mark } from '@buun-mail/brand/react'

import { openExternal } from '../../api/client'
import type { UpdateCheck } from '../../hooks/useUpdateCheck'
import { IconClose, IconExternal, IconReceive } from '../../icons'
import { BusyButton } from '../Busy/BusyButton'

/**
 * A newer Buun Mail is out: a pop-up at the top of the toast stack that stays until it is installed or dismissed.
 * Install downloads the installer for this computer and opens it; What's new opens the release's notes. Dismissed, it
 * stays away until the next version.
 */
export function UpdatePrompt({ updates }: { updates: UpdateCheck }): ReactNode {
  const { t } = useTranslation('settings')
  const found = updates.found
  if (!updates.prompting || found === null) return null
  return (
    <div className="toast toast--update" role="status">
      <span className="toast__glyph toast__glyph--brand" aria-hidden="true">
        <Mark size={22} motion="ping" />
      </span>
      <span className="toast__words">
        <span className="toast__text">{t(found.beta ? 'updates.promptBeta' : 'updates.prompt', { version: found.latest })}</span>
        <span className="toast__detail">{t('updates.promptDetail', { current: found.current })}</span>
        <span className="toast__actions">
          <BusyButton className="toast__action toast__action--primary" glyph={IconReceive} run={updates.install} busyLabel={t(found.inPlace ? 'updates.installingInPlace' : 'updates.installing')}>
            {t(found.inPlace ? 'updates.installRestartShort' : 'updates.installShort')}
          </BusyButton>
          <button type="button" className="toast__action" onClick={() => void openExternal(found.url)}>
            <IconExternal aria-hidden="true" />
            {t('updates.notes')}
          </button>
        </span>
      </span>
      <button type="button" className="toast__close" aria-label={t('updates.dismiss')} onClick={updates.dismiss}>
        <IconClose aria-hidden="true" />
      </button>
    </div>
  )
}
