import type { ReactNode } from 'react'

import { openExternal } from '../../api/client'
import type { Product } from '../../constants/products'
import type { Theme } from '../../constants/ui'
import { IconCheck, IconExternal } from '../../icons'
import { ProductMark } from '../ProductMark/ProductMark'

import './ProductFeature.css'

/**
 * One product shown properly, as on buungroup.com's product band: the two-line heading, what it does, three points and
 * the way out to its site. Fills the reader while no message is open.
 */
export function ProductFeature({ product, theme, eyebrow = 'Also from Buun Group' }: { product: Product; theme: Theme; eyebrow?: string }): ReactNode {
  return (
    <article className={`product-feature tone--${product.id}`} aria-labelledby={`feature-${product.id}`}>
      <p className="product-feature__eyebrow">{eyebrow}</p>
      <div className="product-feature__head">
        <ProductMark product={product} theme={theme} size="md" />
        <div>
          <p className="product-feature__name">{product.name}</p>
          <p className="product-feature__kind">{product.kind}</p>
        </div>
      </div>
      <h2 id={`feature-${product.id}`} className="product-feature__heading">
        <span>{product.heading[0]}</span>
        <span>{product.heading[1]}</span>
      </h2>
      <p className="product-feature__body">{product.body}</p>
      <ul className="product-feature__points">
        {product.points.map((point) => (
          <li key={point}>
            <IconCheck aria-hidden="true" />
            {point}
          </li>
        ))}
      </ul>
      <button type="button" className="product-feature__cta" onClick={() => void openExternal(product.href)}>
        Explore {product.name}
        <IconExternal aria-hidden="true" />
      </button>
    </article>
  )
}
