import { describe, expect, it } from 'vitest'

import { canOpen, previewKind } from '../lib/attachments'

describe('attachments', () => {
  it('opens documents and pictures, never programs or scripts', () => {
    expect(canOpen('Invoice.PDF')).toBe(true)
    expect(canOpen('report.xlsx')).toBe(true)
    expect(canOpen('setup.exe')).toBe(false)
    expect(canOpen('invoice.pdf.exe')).toBe(false)
    expect(canOpen('install.sh')).toBe(false)
    expect(canOpen('README')).toBe(false)
  })

  it('previews pictures and text inside the app, and nothing that could run', () => {
    expect(previewKind('image/png')).toBe('image')
    expect(previewKind('text/csv')).toBe('text')
    expect(previewKind('image/svg+xml')).toBeNull()
    expect(previewKind('application/pdf')).toBeNull()
  })
})
