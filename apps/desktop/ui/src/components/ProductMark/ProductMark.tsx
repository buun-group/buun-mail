import type { ReactNode } from 'react'

import type { Product } from '../../constants/products'
import type { Theme } from '../../constants/ui'

import './ProductMark.css'

/** A product's mark on a raised plate, the way buungroup.com shows a logo. Decorative: the name is always beside it. */
export function ProductMark({ product, theme, size = 'sm' }: { product: Product; theme: Theme; size?: 'sm' | 'md' }): ReactNode {
  return (
    <span className={`product-mark product-mark--${size}`} aria-hidden="true">
      <img src={product.mark[theme]} alt="" />
    </span>
  )
}
