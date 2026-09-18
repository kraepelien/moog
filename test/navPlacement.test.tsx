import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, render, screen } from '@testing-library/react'
import { useNavPlacement } from '@components/navPlacement.ts'
import type { NavPreference } from '@storage/deviceNav.ts'

/* Where the nav goes, which is the window's answer unless somebody has
   overruled it. Driven by resizing the window happy-dom draws into, because the
   query is the whole of what this decides on. */

const WIDE = 1024
const NARROW = 600

function setWidth(width: number) {
  act(() => {
    window.happyDOM.setViewport({ width })
  })
}

function Probe({ preference }: { preference: NavPreference }) {
  return <p>{useNavPlacement(preference)}</p>
}

function placement(preference: NavPreference = 'window') {
  render(<Probe preference={preference} />)
  return screen.getByText(/rail|top/).textContent
}

afterEach(() => {
  cleanup()
  setWidth(WIDE)
})

describe('where the nav goes', () => {
  test('is the rail on a window with room for one', () => {
    setWidth(WIDE)
    expect(placement()).toBe('rail')
  })

  test('is the top of a window without', () => {
    setWidth(NARROW)
    expect(placement()).toBe('top')
  })

  /* The choice is between the rail where it fits and the bar everywhere. There
     is no choosing the rail onto a phone, so a window too narrow for one is not
     asked. */
  test('is the top wherever it was asked for', () => {
    setWidth(WIDE)
    expect(placement('top')).toBe('top')
  })

  /* A window dragged across the width is the same as one opened either side of
     it: the nav moves rather than waiting for a reload. */
  test('follows a window being resized', () => {
    setWidth(WIDE)
    render(<Probe preference="window" />)
    expect(screen.getByText(/rail|top/).textContent).toBe('rail')

    setWidth(NARROW)
    expect(screen.getByText(/rail|top/).textContent).toBe('top')

    setWidth(WIDE)
    expect(screen.getByText(/rail|top/).textContent).toBe('rail')
  })
})
