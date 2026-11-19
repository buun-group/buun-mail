import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { openExternal } from '../../api/client'
import { BUUN_GROUP, PRODUCTS } from '../../constants/products'
import type { Theme } from '../../constants/ui'
import { TipButton } from '../Tooltip/TipButton'

import './BuunFooter.css'

/** The sidebar's foot: the Buun Group logo, which opens the group site, and the other products as a row of marks. */
export function BuunFooter({ theme }: { theme: Theme }): ReactNode {
  const { t } = useTranslation('sidebar')
  return (
    <footer className="buun-footer">
      <TipButton className="buun-footer__group" aria-label={t('footer.group', { name: BUUN_GROUP.name, host: new URL(BUUN_GROUP.href).host })} tip={BUUN_GROUP.name} side="above" onClick={() => void openExternal(BUUN_GROUP.href)}>
        <img src={BUUN_GROUP.logo[theme]} alt="" />
      </TipButton>
      <ul className="buun-footer__marks">
        {PRODUCTS.map((product) => (
          <li key={product.id}>
            <TipButton className="buun-footer__mark" aria-label={t('footer.product', { name: product.name, kind: t(product.kind, { ns: 'products' }) })} tip={product.name} side="above" onClick={() => void openExternal(product.href)}>
              <img src={product.mark[theme]} alt="" />
            </TipButton>
          </li>
        ))}
      </ul>
    </footer>
  )
}
