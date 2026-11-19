import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { Loader, Mark, RouteFlow, Splash } from '../react'

afterEach(cleanup)

describe('the components', () => {
  it('hides an unnamed mark from screen readers and names a labelled one', () => {
    const { container } = render(<Mark />)
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    render(<Mark label="Buun Mail" />)
    expect(screen.getByRole('img', { name: 'Buun Mail' })).toBeTruthy()
  })

  it('tags the motion class', () => {
    const { container } = render(<Mark motion="ping" />)
    expect(container.querySelector('svg')?.classList.contains('bm-ping')).toBe(true)
  })

  it('gives each mark its own gradient', () => {
    const { container } = render(
      <>
        <Mark />
        <Mark />
      </>,
    )
    const ids = [...container.querySelectorAll('linearGradient')].map((gradient) => gradient.id)
    expect(new Set(ids).size).toBe(2)
  })

  it('announces the loader', () => {
    render(<Loader label="Syncing" />)
    expect(screen.getByRole('status').textContent).toContain('Syncing')
  })

  it('stops the splash announcing once done', () => {
    const { container } = render(<Splash done />)
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true')
  })

  it('draws at most three routes, with the caller words', () => {
    render(<RouteFlow routes={[{ from: 'a@a.com', to: 'A' }, { from: 'b@b.com', to: 'B' }, { from: 'c@c.com', to: 'C' }, { from: 'd@d.com', to: 'D' }]} />)
    expect(screen.getByText('C')).toBeTruthy()
    expect(screen.queryByText('D')).toBeNull()
  })
})
