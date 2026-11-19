import type { ReactNode } from 'react'

import { openExternal } from '../../api/client'
import { PRODUCTS } from '../../constants/products'
import type { Theme } from '../../constants/ui'

import './BuunFooter.css'

/** The sidebar's foot: who makes the app, and the other Buun Group products as a row of marks that open their sites. */
export function BuunFooter({ theme, label = 'Buun Group' }: { theme: Theme; label?: string }): ReactNode {
  return (
    <footer className="buun-footer">
      <span className="buun-footer__label">{label}</span>
      <ul className="buun-footer__marks">
        {PRODUCTS.map((product) => (
          <li key={product.id}>
            <button type="button" className="buun-footer__mark" aria-label={`${product.name}, ${product.kind}`} data-name={product.name} onClick={() => void openExternal(product.href)}>
              <img src={product.mark[theme]} alt="" />
            </button>
          </li>
        ))}
      </ul>
    </footer>
  )
}
