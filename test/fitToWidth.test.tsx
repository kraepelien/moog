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
   what is asserted here is that it lands on the elements synchronously. */

const PRINT_WIDTH = 1000
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

function fit(printWidth?: number) {
  const { container } = render(
    <FitToWidth printWidth={printWidth}>
      <div>the panel</div>
    </FitToWidth>,
  )
  const box = container.firstElementChild as HTMLElement
  const content = box.firstElementChild as HTMLElement
  size(box, { clientWidth: WINDOW_WIDTH })
  size(content, { offsetWidth: NATURAL, offsetHeight: NATURAL_HEIGHT })
  act(() => reobserve?.())
  return { box, content }
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
    const { content } = fit(PRINT_WIDTH)
    expect(content.style.transform).toBe(`scale(${WINDOW_WIDTH / NATURAL})`)
  })
})

describe('a panel about to be printed', () => {
  test('is rescaled to the paper, not left at the window’s scale', () => {
    const { content } = fit(PRINT_WIDTH)
    announce('beforeprint')
    expect(content.style.transform).toBe(`scale(${PRINT_WIDTH / NATURAL})`)
  })

  test('takes the height that scale gives it, so the sheet reserves the room', () => {
    const { box } = fit(PRINT_WIDTH)
    announce('beforeprint')
    expect(box.style.height).toBe(`${(NATURAL_HEIGHT * PRINT_WIDTH) / NATURAL}px`)
  })

  test('goes back to the measured scale when the print is over', () => {
    const { box, content } = fit(PRINT_WIDTH)
    announce('beforeprint')
    announce('afterprint')
    expect(content.style.transform).toBe(`scale(${WINDOW_WIDTH / NATURAL})`)
    expect(box.style.height).toBe(`${(NATURAL_HEIGHT * WINDOW_WIDTH) / NATURAL}px`)
  })

  /* The editor's panel has no paper of its own to be fitted to, and a print
     there is whatever the window was showing. */
  test('is left alone where no printable width was given', () => {
    const { content } = fit()
    announce('beforeprint')
    expect(content.style.transform).toBe(`scale(${WINDOW_WIDTH / NATURAL})`)
  })
})
