import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import { PatchNotes } from '@components/library/PatchNotes.tsx'

afterEach(cleanup)

describe('a patch’s notes', () => {
  test('prints what was typed', () => {
    render(<PatchNotes notes="Bring the mod wheel up under the second phrase." />)
    expect(screen.getByText(/Bring the mod wheel up/)).toBeTruthy()
  })

  /* Several of the bank's notes are a run of short instructions, one to a line.
     Reflowed into a paragraph they read as one sentence that does not parse. */
  test('keeps the line breaks somebody put in', () => {
    const { container } = render(<PatchNotes notes={'First this.\nThen that.'} />)
    const body = container.querySelector('p')
    expect(body?.textContent).toBe('First this.\nThen that.')
  })

  test('draws nothing at all for a patch with none', () => {
    const { container } = render(<PatchNotes notes="" />)
    expect(container.firstChild).toBeNull()
  })

  /* A draft whose notes are a stray newline is a patch with no notes, and a
     heading over blank space reads as something that failed to load. */
  test('and nothing for whitespace either', () => {
    const { container } = render(<PatchNotes notes={'  \n  '} />)
    expect(container.firstChild).toBeNull()
  })
})
