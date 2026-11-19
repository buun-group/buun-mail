import type { ReactNode } from 'react'

import type { Product } from '../../constants/products'
import type { Theme } from '../../constants/ui'

import './ProductMark.css'

/** A product's own mark, at the size of the text beside it. Decorative: the name is always written next to it. */
export function ProductMark({ product, theme, size = 'sm' }: { product: Product; theme: Theme; size?: 'sm' | 'md' }): ReactNode {
  return <img className={`product-mark product-mark--${size}`} src={product.mark[theme]} alt="" aria-hidden="true" />
}
