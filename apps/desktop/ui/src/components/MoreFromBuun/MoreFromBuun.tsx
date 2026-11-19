import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { openExternal } from '../../api/client'
import { PRODUCTS } from '../../constants/products'
import type { Theme } from '../../constants/ui'
import { IconExternal } from '../../icons'
import { ProductMark } from '../ProductMark/ProductMark'

import './MoreFromBuun.css'

/** The other Buun Group products as a plain list: mark, name, what it is, where it lives. Each row opens its site. */
export function MoreFromBuun({ theme, title }: { theme: Theme; title?: string }): ReactNode {
  const { t } = useTranslation('sidebar')
  return (
    <section className="more-buun" aria-labelledby="more-buun-title">
      <h2 id="more-buun-title">{title ?? t('more.title')}</h2>
      <ul>
        {PRODUCTS.map((product) => (
          <li key={product.id}>
            <button type="button" className="more-buun__row" onClick={() => void openExternal(product.href)}>
              <ProductMark product={product} theme={theme} size="md" />
              <span className="more-buun__name">{product.name}</span>
              <span className="more-buun__kind">{t(product.kind, { ns: 'products' })}</span>
              <span className="more-buun__host">
                {new URL(product.href).host}
                <IconExternal aria-hidden="true" />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
