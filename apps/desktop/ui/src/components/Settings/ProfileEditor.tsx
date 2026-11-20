import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { listSenders, saveProfile } from '../../api/client'
import type { Workspace } from '../../api/types'
import { toast } from '../../lib/feedback'
import { keepWriting, loadWriting, profileOf } from '../../lib/writing'
import { Select } from '../Select/Select'

/**
 * A workspace's way of writing: the address its new mail starts from (one of its own exact addresses a sender can
 * send as) and the signature its mail carries in place of the sender's.
 */
export function ProfileEditor({ workspace }: { workspace: Workspace }): ReactNode {
  const { t } = useTranslation('settings')
  const [from, setFrom] = useState(() => profileOf(workspace.id)?.from ?? '')
  const [signature, setSignature] = useState(() => profileOf(workspace.id)?.signature ?? '')
  const [domains, setDomains] = useState<string[]>([])

  useEffect(() => {
    void loadWriting().then(() => {
      setFrom(profileOf(workspace.id)?.from ?? '')
      setSignature(profileOf(workspace.id)?.signature ?? '')
    })
    void listSenders().then((senders) => setDomains(senders.flatMap((sender) => sender.domains.filter((domain) => domain.status === 'verified').map((domain) => domain.name))))
  }, [workspace.id])

  const addresses = workspace.addresses.filter((pattern) => !pattern.includes('*') && domains.includes(pattern.split('@')[1] ?? ''))
  const save = (): void => {
    void saveProfile(workspace.id, { from, signature }).then((writing) => {
      keepWriting(writing)
      toast({ text: t('profile.saved'), detail: workspace.name, tone: 'done' })
    })
  }

  return (
    <div className="profile-editor">
      <div className="connect__field">
        <label htmlFor={`profile-from-${workspace.id}`}>{t('profile.from')}</label>
        <Select id={`profile-from-${workspace.id}`} value={from} onChange={setFrom} options={[{ value: '', label: t('profile.fromAny') }, ...addresses.map((address) => ({ value: address, label: address }))]} />
        {addresses.length === 0 && <small>{t('profile.fromNone')}</small>}
      </div>
      <div className="connect__field">
        <label htmlFor={`profile-signature-${workspace.id}`}>{t('profile.signature')}</label>
        <textarea id={`profile-signature-${workspace.id}`} rows={3} value={signature} placeholder={t('profile.signaturePlaceholder')} onChange={(event) => setSignature(event.target.value)} />
        <small>{t('profile.signatureHint')}</small>
      </div>
      <div className="settings__actions settings__actions--tight">
        <button type="button" className="settings__button" onClick={save}>
          {t('profile.save')}
        </button>
      </div>
    </div>
  )
}
