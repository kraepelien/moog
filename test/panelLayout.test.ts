import { describe, expect, test } from 'bun:test'
import {
  BELOW_PANEL,
  PANEL_ROW,
  layoutFor,
  withCaptionRows,
} from '@components/panelLayout.ts'

/* `grid-template-areas` needs every name to be one filled rectangle. A name that
   is not gets the whole template thrown away by the browser, which drops the
   section into a heap rather than failing loudly — so the shapes are checked
   here instead. */
function rectangles(rows: readonly string[]): string[] {
  const grid = rows.map((row) => row.trim().split(/\s+/))
  const broken: string[] = []
  const names = new Set(grid.flat().filter((cell) => cell !== '.'))
  for (const name of names) {
    const cells = grid.flatMap((row, r) =>
      row.flatMap((cell, c) => (cell === name ? [{ r, c }] : [])),
    )
    const top = Math.min(...cells.map((cell) => cell.r))
    const bottom = Math.max(...cells.map((cell) => cell.r))
    const left = Math.min(...cells.map((cell) => cell.c))
    const right = Math.max(...cells.map((cell) => cell.c))
    const area = (bottom - top + 1) * (right - left + 1)
    if (area !== cells.length) broken.push(name)
  }
  return broken
}

describe('the caption row', () => {
  test('gives every cell a caption area of its own', () => {
    expect(withCaptionRows(['a b', 'c .'])).toEqual(['a-cap b-cap', 'a b', 'c-cap .', 'c .'])
  })

  test('lets a control spanning two rows keep spanning through it', () => {
    /* LFO Rate stands beside both switches. Breaking its area in two with a
       caption row would make the whole section's template invalid. */
    expect(withCaptionRows(['lfo on', 'lfo off'])).toEqual([
      'lfo-cap on-cap',
      'lfo on',
      'lfo off-cap',
      'lfo off',
    ])
  })
})

describe('every section', () => {
  for (const id of [...PANEL_ROW, ...BELOW_PANEL]) {
    const layout = layoutFor(id)
    if (!layout) continue

    test(`${id} places each name in one rectangle, captions included`, () => {
      expect(rectangles(layout.rows)).toEqual([])
      expect(rectangles(withCaptionRows(layout.rows))).toEqual([])
    })

    test(`${id} has rows of equal length`, () => {
      const widths = new Set(layout.rows.map((row) => row.trim().split(/\s+/).length))
      expect(widths.size).toBe(1)
    })
  }
})
