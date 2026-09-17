import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PatchHeader } from '@components/library/PatchHeader.tsx'
import { PatchRow } from '@components/library/PatchRow.tsx'
import type { LibraryEntry } from '@components/library/entry.ts'

/* One set of stars carries two numbers — everyone's average until I rate, mine
   afterwards — and the difference between them is a colour, which no test can
   read. What is testable is what a person does to them and what comes back, so
   the stars are pressed here rather than the component asked what it thinks.

   MUI decides which star was pressed from where the pointer is within the
   widget's box, and happy-dom measures every box as zero, so a press would land
   on the fifth star whatever it aimed at. The box is stated instead: 100 wide
   from the origin, which makes the sums below arithmetic rather than a guess. */

const WIDTH = 100

afterEach(cleanup)

function entry(overrides: Partial<LibraryEntry> = {}): LibraryEntry {
  return {
    id: 'sub-bass',
    name: 'Sub Bass',
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

function renderRow(overrides: Partial<LibraryEntry> = {}) {
  const rated: number[] = []
  render(
    <PatchRow entry={entry(overrides)} onOpen={() => {}} onRate={(stars) => rated.push(stars)} />,
  )

  const stars = document.querySelector('.MuiRating-root') as HTMLElement
  stars.getBoundingClientRect = () =>
    ({ left: 0, right: WIDTH, width: WIDTH, top: 0, bottom: 20, height: 20 }) as DOMRect

  /* A press is a move and then a click, and MUI reads the move: without one it
     cannot tell a click on the star already lit from a click clearing it.
     `clientY` is only there to be non-zero, which is how MUI tells a real press
     from the synthetic click a keyboard makes. */
  const press = (stars_: number) => {
    const clientX = (stars_ / 5) * WIDTH - 1
    fireEvent.mouseMove(stars, { clientX, clientY: 10 })
    fireEvent.click(screen.getByRole('radio', { name: label(stars_) }), { clientX, clientY: 10 })
  }

  return { rated, press }
}

function label(stars: number): string {
  return `${stars} Star${stars === 1 ? '' : 's'}`
}

/* Which star the widget is standing at: the one radio it has checked. Read off
   the value rather than the label, which belongs to the element wrapping it. */
function lit(): number | null {
  const checked = screen
    .getAllByRole('radio')
    .find((radio) => (radio as HTMLInputElement).checked)
  return checked === undefined ? null : Number((checked as HTMLInputElement).value)
}

describe('the stars on a library row', () => {
  test('show everyone else’s average while I have not rated it', () => {
    renderRow({ averageRating: 4, ratingCount: 3 })

    expect(screen.getByLabelText('Average rating for Sub Bass')).toBeDefined()
    expect(lit()).toBe(4)
    expect(screen.getByText('4.0 (3)')).toBeDefined()
  })

  test('show mine once I have, with the average still printed beside', () => {
    renderRow({ rating: 2.5, averageRating: 4, ratingCount: 3 })

    expect(screen.getByLabelText('Your rating for Sub Bass')).toBeDefined()
    expect(lit()).toBe(2.5)
    expect(screen.getByText('4.0 (3)')).toBeDefined()
  })

  test('can be given a half star', () => {
    const { rated, press } = renderRow()
    press(3.5)
    expect(rated).toEqual([3.5])
  })

  /* The bug this pins: MUI reports a press on the star already lit as a clear
     and does not say which star was hit. While the stars are showing the
     average, that is every press that agrees with the crowd — and it would
     arrive as 0, which deletes a rating instead of giving one. */
  test('rate rather than clear when I press the star the average is already on', () => {
    const { rated, press } = renderRow({ averageRating: 4, ratingCount: 3 })
    press(4)
    expect(rated).toEqual([4])
  })

  test('clear my rating when I press the star it is already on', () => {
    const { rated, press } = renderRow({ rating: 4, averageRating: 4, ratingCount: 1 })
    press(4)
    expect(rated).toEqual([0])
  })

  test('move my rating when I press a different star', () => {
    const { rated, press } = renderRow({ rating: 4, averageRating: 4, ratingCount: 1 })
    press(1.5)
    expect(rated).toEqual([1.5])
  })
})

/* The bar above the panel draws the same stars the library does, and for a while
   drew them dead: the editor is where a patch is played, so it is where it gets
   rated. */
describe('the stars in the editor', () => {
  function renderHeader(onRate?: (stars: number) => void) {
    render(
      <PatchHeader
        name="Sub Bass"
        tags={[]}
        instrument="minimoog-model-d"
        bank={null}
        rating={null}
        average={3.5}
        ratingCount={2}
        onRate={onRate}
        actions={[]}
      />,
    )
  }

  test('can be pressed on a patch the server holds', () => {
    const rated: number[] = []
    renderHeader((stars) => rated.push(stars))

    expect(screen.getByText('3.5 (2)')).toBeDefined()
    fireEvent.click(screen.getByRole('radio', { name: '5 Stars' }))
    expect(rated).toEqual([5])
  })

  test('are shown but not offered on a draft that has never been saved', () => {
    renderHeader(undefined)

    expect(screen.getByLabelText('Average rating for Sub Bass')).toBeDefined()
    expect(screen.queryAllByRole('radio')).toEqual([])
  })
})
