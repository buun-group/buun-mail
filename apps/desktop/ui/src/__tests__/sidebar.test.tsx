import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { App } from '../App'

beforeAll(() => {
  window.matchMedia = (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
})

beforeEach(() => localStorage.clear())
afterEach(cleanup)

async function ready(): Promise<void> {
  render(<App />)
  await screen.findByText('Quote for the booking site')
}

describe('the sidebar', () => {
  it('folds a workspace when its name is pressed, and remembers it', async () => {
    await ready()
    const heading = screen.getByRole('button', { name: /Plotwork/, expanded: true })
    fireEvent.click(heading)
    expect(heading.getAttribute('aria-expanded')).toBe('false')
    expect(localStorage.getItem('buun-mail:folded-workspaces')).toContain('plotwork')
  })

  it('opens a menu on right click, with a folder renamed in its workspace editor', async () => {
    await ready()
    fireEvent.contextMenu(screen.getByRole('button', { name: /Billing/ }), { clientX: 40, clientY: 80 })
    const menu = screen.getByRole('menu', { name: 'Buun Group, Billing' })
    expect(within(menu).getByRole('menuitem', { name: /Rename or change folders/ }).getAttribute('aria-disabled')).toBeNull()
    expect(within(menu).getByRole('menuitem', { name: /Mark all as read/ }).getAttribute('aria-disabled')).toBeNull()
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('opens the icon picker for a workspace from its menu', async () => {
    await ready()
    fireEvent.contextMenu(screen.getByRole('button', { name: /Personal/, expanded: true }), { clientX: 40, clientY: 80 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Change icon' }))
    const picker = screen.getByRole('radiogroup', { name: 'Icon for Personal' })
    fireEvent.click(within(picker).getByRole('radio', { name: 'rocket' }))
    expect(localStorage.getItem('buun-mail:workspace-looks')).toContain('rocket')
  })

  it('edits a workspace from its menu, in Settings', async () => {
    await ready()
    fireEvent.contextMenu(screen.getByRole('button', { name: /Buun Group/, expanded: true }), { clientX: 40, clientY: 80 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit workspace' }))
    const editor = await screen.findByRole('form', { name: 'Edit Buun Group' })
    expect((within(editor).getByLabelText('Name') as HTMLInputElement).value).toBe('Buun Group')
    expect((within(editor).getByLabelText('Addresses') as HTMLTextAreaElement).value).toBe('*@buungroup.com')
    expect((within(editor).getByLabelText('Folder 1 sender') as HTMLInputElement).value).toBe('*@stripe.com')
    fireEvent.click(within(editor).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('form', { name: 'Edit Buun Group' })).toBeNull()
  })

  it('adds a workspace in Settings, then deletes it from the sidebar after asking', async () => {
    await ready()
    fireEvent.contextMenu(screen.getByRole('button', { name: /Personal/, expanded: true }), { clientX: 40, clientY: 80 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit workspace' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Add workspace' }))
    const editor = screen.getByRole('form', { name: 'New workspace' })
    fireEvent.change(within(editor).getByLabelText('Name'), { target: { value: 'Side gig' } })
    fireEvent.click(within(editor).getByRole('button', { name: 'Add workspace' }))
    expect(await within(editor).findByRole('alert')).toBeTruthy()
    fireEvent.change(within(editor).getByLabelText('Addresses'), { target: { value: '*@gig.example' } })
    // The button shows it is busy for a moment, then is ready again.
    fireEvent.click(await within(editor).findByRole('button', { name: 'Add workspace' }, { timeout: 3000 }))
    const added = await screen.findByRole('button', { name: /Side gig/, expanded: true }, { timeout: 3000 })

    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }))
    fireEvent.contextMenu(added, { clientX: 40, clientY: 80 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete workspace' }))
    const ask = screen.getByRole('dialog', { name: 'Delete Side gig?' })
    fireEvent.click(within(ask).getByRole('button', { name: 'Delete workspace' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /Side gig/, expanded: true })).toBeNull())
    expect(await screen.findByText('Side gig deleted')).toBeTruthy()
  })

  it('collapses to a rail and remembers it', async () => {
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse the sidebar' }))
    expect(screen.getByRole('navigation', { name: 'Workspaces' }).dataset['rail']).toBe('true')
    expect(localStorage.getItem('buun-mail:sidebar')).toBe('collapsed')
  })
})

describe('the header theme button', () => {
  it('steps from Match system to Light to Dark', async () => {
    await ready()
    fireEvent.click(screen.getByRole('button', { name: /^Theme: Match system/ }))
    expect(document.documentElement.dataset['theme']).toBe('light')
    fireEvent.click(screen.getByRole('button', { name: /^Theme: Light/ }))
    expect(document.documentElement.dataset['theme']).toBe('dark')
  })
})

describe('general settings', () => {
  it('turns the paper grain off', async () => {
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(document.querySelectorAll('.grain')).toHaveLength(2)
    fireEvent.click(screen.getByRole('switch', { name: 'Paper grain' }))
    expect(document.querySelectorAll('.grain')).toHaveLength(0)
    expect(localStorage.getItem('buun-mail:grain')).toBe('off')
  })
})

describe('the views section', () => {
  it('folds away and comes back', async () => {
    render(<App />)
    const views = await screen.findByRole('button', { name: /^Views/ })
    expect(screen.getByRole('button', { name: /^All mail/ })).toBeTruthy()
    fireEvent.click(views)
    expect(views.getAttribute('aria-expanded')).toBe('false')
    // It folds shut with a short animation, then is gone.
    await waitFor(() => expect(screen.queryByRole('button', { name: /^All mail/ })).toBeNull())
    fireEvent.click(views)
    expect(await screen.findByRole('button', { name: /^All mail/ })).toBeTruthy()
  })
})
