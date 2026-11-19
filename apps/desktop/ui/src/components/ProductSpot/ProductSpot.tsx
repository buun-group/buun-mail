import { useCallback, useRef } from 'react'
import type { ReactNode } from 'react'

import { openExternal } from '../../api/client'
import { PRODUCT_ROTATE_MS, PRODUCTS } from '../../constants/products'
import type { Theme } from '../../constants/ui'
import { useRotation } from '../../hooks/useRotation'
import { IconExternal } from '../../icons'
import { ProductMark } from '../ProductMark/ProductMark'

import './ProductSpot.css'

/**
 * The sidebar's quiet advert: one Buun Group product at a time on an ink card, its hue as a line along the top, stepping
 * to the next every few seconds unless the pointer or focus is on it. The marks below pick one directly.
 */
export function ProductSpot({ theme, title = 'From Buun Group' }: { theme: Theme; title?: string }): ReactNode {
  const spot = useRef<HTMLElement | null>(null)
  const isHeld = useCallback(() => spot.current?.matches(':hover, :focus-within') ?? false, [])
  const { index, go } = useRotation(PRODUCTS.length, PRODUCT_ROTATE_MS, isHeld)
  const product = PRODUCTS[index] ?? PRODUCTS[0]
  if (product === undefined) return null

  return (
    <aside ref={spot} className={`product-spot tone--${product.id}`} aria-label={title}>
      <p className="product-spot__title">{title}</p>
      <button type="button" className="product-spot__card" onClick={() => void openExternal(product.href)} aria-label={`${product.name}, ${product.kind}. Opens ${new URL(product.href).host}`}>
        <span key={product.id} className="product-spot__body">
          <span className="product-spot__head">
            <ProductMark product={product} theme="light" />
            <span>
              <span className="product-spot__name">{product.name}</span>
              <span className="product-spot__kind">{product.kind}</span>
            </span>
          </span>
          <span className="product-spot__line">
            {product.heading[0]} {product.heading[1]}
          </span>
          <span className="product-spot__visit">
            {new URL(product.href).host}
            <IconExternal aria-hidden="true" />
          </span>
        </span>
      </button>
      <div className="product-spot__picker" role="group" aria-label="Choose a product">
        {PRODUCTS.map((item, at) => (
          <button key={item.id} type="button" className={at === index ? 'product-spot__pick product-spot__pick--on' : 'product-spot__pick'} aria-label={item.name} aria-pressed={at === index} onClick={() => go(at)}>
            <img src={item.mark[theme]} alt="" />
          </button>
        ))}
      </div>
    </aside>
  )
}
