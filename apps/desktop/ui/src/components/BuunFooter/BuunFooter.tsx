import type { ReactNode } from 'react'

import { openExternal } from '../../api/client'
import { BUUN_GROUP, PRODUCTS } from '../../constants/products'
import type { Theme } from '../../constants/ui'
import { TipButton } from '../Tooltip/TipButton'

import './BuunFooter.css'

/** The sidebar's foot: the Buun Group logo, which opens the group site, and the other products as a row of marks. */
export function BuunFooter({ theme }: { theme: Theme }): ReactNode {
  return (
    <footer className="buun-footer">
      <TipButton className="buun-footer__group" aria-label={`${BUUN_GROUP.name}, opens ${new URL(BUUN_GROUP.href).host}`} tip={BUUN_GROUP.name} side="above" onClick={() => void openExternal(BUUN_GROUP.href)}>
        <img src={BUUN_GROUP.logo[theme]} alt="" />
      </TipButton>
      <ul className="buun-footer__marks">
        {PRODUCTS.map((product) => (
          <li key={product.id}>
            <TipButton className="buun-footer__mark" aria-label={`${product.name}, ${product.kind}`} tip={product.name} side="above" onClick={() => void openExternal(product.href)}>
              <img src={product.mark[theme]} alt="" />
            </TipButton>
          </li>
        ))}
      </ul>
    </footer>
  )
}
