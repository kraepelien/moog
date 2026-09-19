import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  PAGE_HEIGHT_MM,
  PAGE_MARGIN_MM,
  PAGE_SIZE,
  PAGE_WIDTH_MM,
  printableWidthPx,
  printScale,
} from '@components/printSheet.ts'

const ROOT = resolve(import.meta.dir, '..')
const sheet = readFileSync(join(ROOT, 'src/print.css'), 'utf8')

describe('the scale a panel prints at', () => {
  test('fits a panel wider than the page onto it', () => {
    expect(printScale(2000, 1000)).toBe(0.5)
  })

  test('never magnifies one narrower than the page', () => {
    expect(printScale(500, 1000)).toBe(1)
  })

  test('answers for a panel that has not been laid out yet', () => {
    expect(printScale(0, 1000)).toBe(1)
  })
})

describe('the printable width', () => {
  test('subtracts both margins, not one', () => {
    const margins = PAGE_MARGIN_MM * 2 * (96 / 25.4)
    expect(printableWidthPx()).toBeCloseTo(PAGE_WIDTH_MM * (96 / 25.4) - margins, 6)
  })

  test('is narrower than the paper by exactly that much', () => {
    expect(printableWidthPx()).toBeLessThan(PAGE_WIDTH_MM * (96 / 25.4))
  })
})

/* The stylesheet and the constants are two statements of one rectangle, and
   only the constants are reachable from a test of the scale. Read off disk and
   matched, the way test/readme.test.ts keeps prose from drifting from the
   registry: a page box changed in one file and not the other prints a panel
   scaled for paper that is not in the printer. */
describe('the @page rule', () => {
  const rule = /@page\s*\{([^}]*)\}/.exec(sheet)

  test('is there to be read', () => {
    expect(rule).not.toBeNull()
  })

  test('names the same paper the constants describe', () => {
    expect(rule![1]).toContain(`size: ${PAGE_SIZE};`)
    /* A4 is 210 by 297 upright, so landscape is the constants the other way up. */
    expect([PAGE_HEIGHT_MM, PAGE_WIDTH_MM]).toEqual([210, 297])
  })

  test('carries the same margin', () => {
    expect(rule![1]).toContain(`margin: ${PAGE_MARGIN_MM}mm;`)
  })
})
