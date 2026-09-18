import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { HomePage } from '@components/home/HomePage.tsx'
import { factsOf, figuresOf, recent, shelfOf } from '@components/home/stats.ts'
import type { LibraryEntry } from '@components/library/entry.ts'
import { SILENT } from '@audio/settings.ts'
import { panelRegistry } from '@controls/panel.ts'

/* The page is driven rather than called: what it has to get right is that the
   figures count the bank it was handed, that a card opens the patch it was
   drawn from, and that the doors lead where the rail leads. */

afterEach(cleanup)

const PANEL = { controls: 47, audible: 44 }

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
  entry({ id: 'sub-bass', name: 'Sub Bass', tags: ['bass'], averageRating: 4 }),
  entry({ id: 'fuzz-lead', name: 'Fuzz Lead', tags: ['lead'], averageRating: 5 }),
  entry({
    id: 'my-patch',
    name: 'My Patch',
    origin: 'user',
    mine: true,
    updatedAt: '2026-03-01T00:00:00.000Z',
  }),
  entry({ id: 'borrowed-pad', name: 'Borrowed Pad', origin: 'user', ownerName: 'Wendy' }),
]

function renderHome(entries: readonly LibraryEntry[] = BANK) {
  const opened: string[] = []
  const went: string[] = []
  render(
    <HomePage
      entries={entries}
      onNavigate={(path) => went.push(path)}
      onOpen={(item) => opened.push(item.id)}
    />,
  )
  return { opened, went }
}

/* The figure a kicker stands over, which is the pairing the strip is for: a
   number on its own says nothing about which count it is. */
function figureUnder(kicker: string): string {
  const term = screen.getByText(kicker)
  return term.nextElementSibling?.textContent ?? ''
}

describe('the figures', () => {
  test('count the bank they were handed', () => {
    renderHome()
    expect(figureUnder('Library')).toBe('4')
    expect(figureUnder('Your bank')).toBe('1')
    expect(figureUnder('Rated')).toBe('4.5')
  })

  test('report the panel the app actually has', () => {
    renderHome()
    expect(figureUnder('Panel')).toBe(String(panelRegistry.controls.length))
  })

  test('do not call a control audible that is listed as silent', () => {
    /* Three controls have nothing a browser could plug into, and the page said
       every one of them was live. */
    const silent = Object.keys(SILENT).length
    expect(silent).toBeGreaterThan(0)
    const facts = factsOf([], {
      controls: panelRegistry.controls.length,
      audible: panelRegistry.controls.length - silent,
    })
    const panel = figuresOf(facts).find((figure) => figure.kicker === 'Panel')
    expect(panel?.caption).toBe(`controls, ${panelRegistry.controls.length - silent} of them audible`)
  })

  test('say so rather than printing a zero when nothing is rated', () => {
    const facts = factsOf([entry({ id: 'one' })], PANEL)
    const rated = figuresOf(facts).find((figure) => figure.kicker === 'Rated')
    expect(rated?.value).toBeNull()
    expect(rated?.caption).toBe('nothing rated yet')
  })

  test("count only the viewer's own patches as theirs", () => {
    /* Someone else's published patch is in the library and is not yours: the
       trap is counting everything that is not factory. */
    expect(factsOf(BANK, PANEL).mine).toBe(1)
  })

  test('stand an empty library up without dividing by nothing', () => {
    const facts = factsOf([], PANEL)
    expect(facts.average).toBeNull()
    expect(figuresOf(facts)).toHaveLength(4)
  })
})

describe('the shelf', () => {
  test('puts the most recently updated first', () => {
    expect(recent(BANK, 2).map((item) => item.id)).toEqual(['my-patch', 'sub-bass'])
  })

  test('leads with your own work, and fills the row from the rest', () => {
    const shelf = shelfOf(BANK, 3)
    expect(shelf.title).toBe('Pick up where you left off')
    expect(shelf.entries[0]?.id).toBe('my-patch')
    expect(shelf.entries).toHaveLength(3)
  })

  test('does not claim you left off anywhere when you have saved nothing', () => {
    /* Every factory patch is stamped by the same seed, so the newest four are
       arbitrary and the heading has to say something else. */
    const shelf = shelfOf(BANK.filter((item) => !item.mine), 3)
    expect(shelf.title).toBe('Start with one of these')
  })

  test('opens the patch its card was drawn from', () => {
    const { opened } = renderHome()
    fireEvent.click(screen.getByRole('button', { name: 'Open My Patch in the editor' }))
    expect(opened).toEqual(['my-patch'])
  })

  test('is left out entirely when the library is empty', () => {
    renderHome([])
    expect(screen.queryByText('Pick up where you left off')).toBeNull()
    expect(screen.queryByText('Start with one of these')).toBeNull()
  })
})

describe('the ways on', () => {
  test('the headline action leads to the editor', () => {
    const { went } = renderHome()
    fireEvent.click(screen.getByRole('button', { name: 'Open the editor' }))
    expect(went).toEqual(['/editor'])
  })

  test('a door leads to the page it is named for', () => {
    const { went } = renderHome()
    fireEvent.click(screen.getByRole('button', { name: /^Play MIDI/ }))
    expect(went).toEqual(['/midi'])
  })
})
