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
  entry({
    id: 'my-patch',
    name: 'My Patch',
    origin: 'user',
    mine: true,
    tags: ['bass'],
    visibility: 'private',
  }),
  entry({ id: 'borrowed-pad', name: 'Borrowed Pad', origin: 'user', ownerName: 'Wendy' }),
]

function renderLibrary(
  entries: readonly LibraryEntry[] = BANK,
  extra: { openId?: string; tagPalette?: Readonly<Record<string, string>> } = {},
) {
  const opened: string[] = []
  render(
    <PatchLibrary entries={entries} onOpen={(item) => opened.push(item.id)} {...extra} />,
  )
  return { opened }
}

function rowNames(): string[] {
  return screen
    .getAllByRole('button')
    .map((node) => node.getAttribute('aria-label') ?? '')
    .filter((label) => label.startsWith('Open '))
    .map((label) => label.replace(/^Open /, '').replace(/ in the editor$/, ''))
}

/* Opening a patch leaves the library, so coming back to a list of forty-four
   with no idea which one is loaded is what this answers. */
describe('the patch the editor is showing', () => {
  test('is the row that says it is open, and only that one', () => {
    renderLibrary(BANK, { openId: 'fuzz-lead' })
    expect(screen.getByRole('button', { name: 'Fuzz Lead, open in the editor' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Open Sub Bass in the editor' })).toBeDefined()
  })

  test('is nothing at all for a draft that has never been saved', () => {
    renderLibrary(BANK, { openId: undefined })
    expect(screen.queryByRole('button', { name: /open in the editor/ })).toBeNull()
  })

  /* The bug this pins: the whole line used to be the button, so a press aimed at
     the stars and landing a few pixels under them left the library and loaded a
     patch. Only the name opens one. */
  test('is not opened by pressing the line beside the name', () => {
    const { opened } = renderLibrary(BANK)
    fireEvent.click(screen.getAllByRole('listitem')[0])
    expect(opened).toEqual([])
  })

  /* Marked, not disabled: pressing it again is how you throw away an edit and
     start from what was saved. */
  test('can still be opened again', () => {
    const { opened } = renderLibrary(BANK, { openId: 'fuzz-lead' })
    fireEvent.click(screen.getByRole('button', { name: 'Fuzz Lead, open in the editor' }))
    expect(opened).toEqual(['fuzz-lead'])
  })
})

/* A tag points at no row, so a colour an admin chose has to reach the chips by
   being handed to them rather than by the chip looking it up. */
describe('a category an administrator gave a colour', () => {
  test('is drawn in it wherever the chip appears', () => {
    renderLibrary(BANK, { tagPalette: { bass: '#ff8800' } })
    const chips = screen.getAllByRole('button', { name: /bass/i })
    const coloured = chips.filter((node) => getComputedStyle(node).color === '#ff8800')
    expect(coloured.length).toBeGreaterThan(0)
  })
})

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
     to reach it as readily as it reaches a factory one. */
  test('a category chip reaches a saved patch as well as a factory one', () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Factory' }))
    expect(rowNames()).toEqual(['Sub Bass', 'Fuzz Lead'])
  })

  test('the Other row tells your own from everyone else\u2019s', () => {
    renderLibrary()
    fireEvent.click(screen.getByRole('button', { name: 'User' }))
    expect(rowNames()).toEqual(['My Patch'])

    fireEvent.click(screen.getByRole('button', { name: 'Custom' }))
    expect(rowNames()).toEqual(['My Patch', 'Borrowed Pad'])
  })

  /* The bank is not a field on the patch: the same saved patch is User to whoever
     saved it and Custom to everyone else, which is why the server sends `mine`
     per viewer rather than the library deciding it once. */
  test('one patch reads as User to its owner and Custom to anyone else', () => {
    renderLibrary([entry({ id: 'shared', name: 'Shared', origin: 'user', mine: true })])
    expect(screen.getByRole('button', { name: 'Show only user patches' })).toBeDefined()

    cleanup()

    renderLibrary([entry({ id: 'shared', name: 'Shared', origin: 'user', mine: false })])
    expect(screen.getByRole('button', { name: 'Show only custom patches' })).toBeDefined()
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
    expect(rowNames()).toEqual(['Sub Bass', 'Fuzz Lead', 'Borrowed Pad'])
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
