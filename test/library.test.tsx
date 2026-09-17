import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PatchLibrary, PER_PAGE } from '@components/library/PatchLibrary.tsx'
import type { LibraryEntry } from '@components/library/entry.ts'

/* The library is driven here rather than called: what it has to get right is
   that a chip narrows the list, that a row opens the patch it is drawn from, and
   that the pager does not offer a page with nothing on it — none of which a test
   of the filter function alone would catch. */

afterEach(cleanup)

function entry(overrides: Partial<LibraryEntry> & { id: string }): LibraryEntry {
  return {
    name: overrides.id,
    origin: 'factory',
    tags: [],
    instrument: 'minimoog-model-d',
    visibility: 'public',
    approximate: false,
    mine: false,
    ownerName: null,
    rating: null,
    averageRating: null,
    ratingCount: 0,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const BANK: readonly LibraryEntry[] = [
  entry({ id: 'sub-bass', name: 'Sub Bass', tags: ['bass'] }),
  entry({ id: 'fuzz-lead', name: 'Fuzz Lead', tags: ['lead'] }),
  entry({ id: 'my-patch', name: 'My Patch', origin: 'user', tags: ['bass'], visibility: 'private' }),
]

function renderLibrary(entries: readonly LibraryEntry[] = BANK) {
  const opened: string[] = []
  render(<PatchLibrary entries={entries} onOpen={(item) => opened.push(item.id)} />)
  return { opened }
}

function rowNames(): string[] {
  return screen
    .getAllByRole('button')
    .map((node) => node.getAttribute('aria-label') ?? '')
    .filter((label) => label.startsWith('Open '))
    .map((label) => label.replace(/^Open /, '').replace(/ in the editor$/, ''))
}

describe('finding a patch', () => {
  test('typing narrows the list to matching names', () => {
    renderLibrary()
    fireEvent.change(screen.getByLabelText('Search for names, categories, synths or stars'), {
      target: { value: 'sub' },
    })
    expect(rowNames()).toEqual(['Sub Bass'])
  })

  /* The search box says it covers categories, so a tag has to answer to it too
     or the placeholder is a lie. */
  test('typing matches a tag the name does not carry', () => {
    renderLibrary([entry({ id: 'x', name: 'Destitution', tags: ['percussion'] })])
    fireEvent.change(screen.getByLabelText('Search for names, categories, synths or stars'), {
      target: { value: 'percuss' },
    })
    expect(rowNames()).toEqual(['Destitution'])
  })

  test('switching a category chip on keeps only patches wearing it', () => {
    renderLibrary()
    fireEvent.click(screen.getByRole('button', { name: 'lead' }))
    expect(rowNames()).toEqual(['Fuzz Lead'])
  })

  /* A saved patch carries its own tags now that the summary does, so a chip has
     to reach it as readily as it reaches a preset. */
  test('a category chip reaches a saved patch as well as a preset', () => {
    renderLibrary()
    fireEvent.click(screen.getByRole('button', { name: 'bass' }))
    expect(rowNames()).toEqual(['Sub Bass', 'My Patch'])
  })

  test('switching the same chip off puts everything back', () => {
    renderLibrary()
    const chip = screen.getByRole('button', { name: 'lead' })
    fireEvent.click(chip)
    fireEvent.click(chip)
    expect(rowNames()).toHaveLength(BANK.length)
  })

  test('the Other row tells factory content from your own', () => {
    renderLibrary()
    fireEvent.click(screen.getByRole('button', { name: 'User' }))
    expect(rowNames()).toEqual(['My Patch'])
  })

  test('a search matching nothing says so rather than showing an empty card', () => {
    renderLibrary()
    fireEvent.change(screen.getByLabelText('Search for names, categories, synths or stars'), {
      target: { value: 'nothing here' },
    })
    expect(rowNames()).toEqual([])
    expect(screen.getByText(/Nothing matches/)).toBeTruthy()
  })
})

describe('opening a patch', () => {
  test('clicking a row reports the entry that row was drawn from', () => {
    const { opened } = renderLibrary()
    fireEvent.click(screen.getByRole('button', { name: 'Open Fuzz Lead in the editor' }))
    expect(opened).toEqual(['fuzz-lead'])
  })

  /* The row is a button and the chips sit inside it, so a press has to stop at
     the chip: filtering on something you can see must not also open the patch
     you happened to read it off. */
  test('pressing a tag on a row filters by it and leaves the editor alone', () => {
    const { opened } = renderLibrary()
    fireEvent.click(screen.getByRole('button', { name: 'Show only lead patches' }))
    expect(rowNames()).toEqual(['Fuzz Lead'])
    expect(opened).toEqual([])
  })

  test('pressing the same tag again puts the rest back', () => {
    renderLibrary()
    fireEvent.click(screen.getByRole('button', { name: 'Show only lead patches' }))
    fireEvent.click(screen.getByRole('button', { name: 'Show only lead patches' }))
    expect(rowNames()).toHaveLength(BANK.length)
  })

  test('pressing where a row came from filters by that bank', () => {
    const { opened } = renderLibrary()
    fireEvent.click(screen.getAllByRole('button', { name: 'Show only user patches' })[0]!)
    expect(rowNames()).toEqual(['My Patch'])
    expect(opened).toEqual([])
  })

  /* Published is a flag beside the banks rather than one of them, so the chip
     saying so has to reach a different field than the one next to it. */
  test('pressing the public chip keeps only what is published', () => {
    renderLibrary()
    fireEvent.click(screen.getAllByRole('button', { name: 'Show only public patches' })[0]!)
    expect(rowNames()).toEqual(['Sub Bass', 'Fuzz Lead'])
  })

  /* Only one instrument exists, so the second here is a patch from a later build
     whose synth the chip names by id. It still has to filter. */
  test('pressing a synth on a row filters by it', () => {
    renderLibrary([...BANK, entry({ id: 'other', name: 'Other Synth', instrument: 'prophet-5' })])
    fireEvent.click(screen.getAllByRole('button', { name: 'Show only prophet-5 patches' })[0]!)
    expect(rowNames()).toEqual(['Other Synth'])
  })
})

describe('paging', () => {
  const many = Array.from({ length: PER_PAGE + 5 }, (_, index) =>
    entry({ id: `patch-${index}`, name: `Patch ${index}` }),
  )

  test('a bank longer than a page is cut to one page', () => {
    renderLibrary(many)
    expect(rowNames()).toHaveLength(PER_PAGE)
  })

  test('nothing pages when everything fits', () => {
    renderLibrary()
    expect(screen.queryByLabelText('Library pages')).toBeNull()
  })

  /* Page 2, then a filter narrow enough to leave one page: without the clamp the
     list comes back empty under a pager still claiming results. */
  test('narrowing the filters while past the end falls back to the first page', () => {
    renderLibrary([...many, entry({ id: 'odd-one', name: 'Odd One', tags: ['bass'] })])
    fireEvent.click(screen.getByRole('button', { name: 'Go to page 2' }))
    expect(rowNames().length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'bass' }))
    expect(rowNames()).toEqual(['Odd One'])
  })
})
