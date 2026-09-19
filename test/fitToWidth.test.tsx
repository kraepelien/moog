import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { act, cleanup, render } from '@testing-library/react'
import { FitToWidth } from '@components/FitToWidth.tsx'

/* The regression this file exists for: the panel's scale is an inline
   transform, and the number in it is the window's. `window.print()` lays the
   page out at the paper's width, but a ResizeObserver callback is delivered at
   the end of a frame and the print snapshot is already taken by then, so on a
   wide monitor the sheet came out overflowing the page and on a narrow one it
   came out small in a corner. A stylesheet cannot correct an inline transform
   without !important, and would have no number to put in it either.

   So the scale is recomputed for the paper inside the beforeprint handler, and
   what is asserted here is that it lands on the elements synchronously, and
   that it satisfies the height of the page as well as the width. */

const WIDE = 1000
const TALL = 10000
const NATURAL = 2000
const NATURAL_HEIGHT = 600
const WINDOW_WIDTH = 600

/* happy-dom lays nothing out, so the three measurements the component takes are
   put on the elements by hand, and its ResizeObserver never fires: this one
   hands the callback back so a measurement of the screen can be driven. */
let reobserve: (() => void) | null = null
const realObserver = globalThis.ResizeObserver

class Stub {
  constructor(callback: () => void) {
    reobserve = callback
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  reobserve = null
  globalThis.ResizeObserver = Stub as unknown as typeof ResizeObserver
})

afterEach(() => {
  cleanup()
  globalThis.ResizeObserver = realObserver
})

function size(element: Element, sizes: Readonly<Record<string, number>>) {
  for (const [name, value] of Object.entries(sizes)) {
    Object.defineProperty(element, name, { value, configurable: true })
  }
}

function fit(room?: { width: number; height: number }) {
  const asked: number[] = []
  const { container } = render(
    <FitToWidth
      printRoom={
        room === undefined
          ? undefined
          : () => {
              asked.push(1)
              return room
            }
      }
    >
      <div>the panel</div>
    </FitToWidth>,
  )
  const box = container.firstElementChild as HTMLElement
  const content = box.firstElementChild as HTMLElement
  size(box, { clientWidth: WINDOW_WIDTH })
  size(content, { offsetWidth: NATURAL, offsetHeight: NATURAL_HEIGHT })
  act(() => reobserve?.())
  return { box, content, asked }
}

/* fireEvent cannot target window under happy-dom, so the event is dispatched on
   the body and reaches the window listener by bubbling. */
function announce(name: 'beforeprint' | 'afterprint') {
  act(() => {
    document.body.dispatchEvent(new Event(name, { bubbles: true }))
  })
}

describe('a panel fitted to the window', () => {
  test('is scaled to the width it is given', () => {
    const { content } = fit({ width: WIDE, height: TALL })
    expect(content.style.transform).toBe(`scale(${WINDOW_WIDTH / NATURAL})`)
  })

  test('is not asked about the paper until there is a print', () => {
    const { asked } = fit({ width: WIDE, height: TALL })
    expect(asked.length).toBe(0)
  })
})

describe('a panel about to be printed', () => {
  test('is rescaled to the paper, not left at the window’s scale', () => {
    const { content } = fit({ width: WIDE, height: TALL })
    announce('beforeprint')
    expect(content.style.transform).toBe(`scale(${WIDE / NATURAL})`)
  })

  test('takes the height that scale gives it, so the sheet reserves the room', () => {
    const { box } = fit({ width: WIDE, height: TALL })
    announce('beforeprint')
    expect(box.style.height).toBe(`${(NATURAL_HEIGHT * WIDE) / NATURAL}px`)
  })

  test('goes back to the measured scale when the print is over', () => {
    const { box, content } = fit({ width: WIDE, height: TALL })
    announce('beforeprint')
    announce('afterprint')
    expect(content.style.transform).toBe(`scale(${WINDOW_WIDTH / NATURAL})`)
    expect(box.style.height).toBe(`${(NATURAL_HEIGHT * WINDOW_WIDTH) / NATURAL}px`)
  })

  /* The editor's panel has no paper of its own to be fitted to, and a print
     there is whatever the window was showing. */
  test('is left alone where no room on the paper was described', () => {
    const { content } = fit()
    announce('beforeprint')
    expect(content.style.transform).toBe(`scale(${WINDOW_WIDTH / NATURAL})`)
  })
})

/* What the width alone got wrong: it printed a panel that fitted across the
   page and left the notes box no room down it, and `break-inside: avoid` then
   moved the whole box onto a second sheet. */
describe('a page with less height left than width', () => {
  test('takes the scale from the height instead', () => {
    const { content } = fit({ width: WIDE, height: 240 })
    announce('beforeprint')
    expect(content.style.transform).toBe(`scale(${240 / NATURAL_HEIGHT})`)
  })

  test('and the height is what the wrapper then reserves', () => {
    const { box } = fit({ width: WIDE, height: 240 })
    announce('beforeprint')
    expect(box.style.height).toBe('240px')
  })

  test('still never magnifies a panel that fits both ways', () => {
    const { content } = fit({ width: NATURAL * 2, height: NATURAL_HEIGHT * 2 })
    announce('beforeprint')
    expect(content.style.transform).toBe('scale(1)')
  })

  /* A sheet whose other parts have already taken the whole page. Printing the
     panel at nothing would be worse than printing it across two sheets, so the
     height drops out of the decision and the width answers alone. */
  test('falls back to the width where the page has no room left at all', () => {
    const { content } = fit({ width: WIDE, height: -40 })
    announce('beforeprint')
    expect(content.style.transform).toBe(`scale(${WIDE / NATURAL})`)
  })
})
