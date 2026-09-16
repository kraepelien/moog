import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Panel } from '../src/components/Panel.tsx'
import { panelRegistry } from '../src/controls/panel.ts'
import { defaultValues } from '../src/controls/registry.ts'
import type { ControlValue } from '../src/controls/types.ts'

/* Everything else in this suite tests logic. These render the panel and use it,
   because the failures that actually reached the browser — a control detached
   from its value, a knob that would not turn, an editor that committed the wrong
   number — are all invisible to a test that only calls functions. */

afterEach(cleanup)

interface Change {
  id: string
  value: ControlValue
}

function renderPanel(overrides: Record<string, ControlValue> = {}) {
  const changes: Change[] = []
  const values = { ...defaultValues(panelRegistry), ...overrides }
  render(
    <Panel
      registry={panelRegistry}
      values={values}
      onChange={(id, value) => changes.push({ id, value })}
    />,
  )
  return { changes, values }
}

describe('a control is wired to its own id', () => {
  /* The risk the layout work introduced: grid placement puts a control
     somewhere by name, and a wrong name would draw a panel that looks right
     while a knob saves to the wrong control — or to nothing. */
  test('turning Oscillator-2 frequency reports osc2Frequency', () => {
    const { changes } = renderPanel()
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Oscillator-2' }), { key: 'ArrowUp' })
    expect(changes).toHaveLength(1)
    expect(changes[0]!.id).toBe('osc2Frequency')
  })

  test('turning Oscillator-3 frequency reports osc3Frequency', () => {
    const { changes } = renderPanel()
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Oscillator-3' }), { key: 'ArrowUp' })
    expect(changes[0]!.id).toBe('osc3Frequency')
  })

  test('a switch reports its own id', () => {
    const { changes } = renderPanel()
    fireEvent.click(screen.getByRole('switch', { name: 'Filter Modulation' }))
    expect(changes[0]!.id).toBe('filterModulation')
  })

  test('every control on the panel is reachable and none is reported twice', () => {
    renderPanel()
    const rendered = [
      ...screen.queryAllByRole('slider'),
      ...screen.queryAllByRole('switch'),
    ]
    /* Not every control is drawn — Output and Power are decorations — but no
       control may be drawn twice, which a grid placing an id in two cells would
       silently do. */
    expect(rendered.length).toBeGreaterThan(20)
    expect(new Set(rendered).size).toBe(rendered.length)
  })
})

describe('a knob with a hidden label is still announced', () => {
  test('Range and Waveform keep their names for a screen reader', () => {
    /* Their printed labels were removed once the column heading carried them.
       A heading is a sibling in a grid and cannot name a knob on its own, so
       without the fallback these announce only a number. */
    renderPanel()
    expect(screen.getAllByRole('slider', { name: 'Range' }).length).toBe(3)
    expect(screen.getAllByRole('slider', { name: 'Waveform' }).length).toBe(3)
  })

  test('a mixer volume under a blank label answers to its oscillator', () => {
    /* The Mixer heads only the top knob; the two under it are named by the
       switch beside them, which a screen reader cannot follow. */
    renderPanel()
    expect(screen.getByRole('slider', { name: 'Osc.2 Volume' })).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Osc.3 Volume' })).toBeTruthy()
  })
})

describe('turning a step knob', () => {
  test('an arrow moves one position and reports the position id', () => {
    const { changes } = renderPanel({ osc1Range: 'ft16' })
    fireEvent.keyDown(screen.getAllByRole('slider', { name: 'Range' })[0]!, { key: 'ArrowUp' })
    expect(changes[0]!.value).toBe('ft8')
  })

  test('it stops at the end rather than wrapping', () => {
    const { changes } = renderPanel({ osc1Range: 'ft2' })
    fireEvent.keyDown(screen.getAllByRole('slider', { name: 'Range' })[0]!, { key: 'ArrowUp' })
    expect(changes[0]!.value).toBe('ft2')
  })

  test('it reads out the position it is on, not a number', () => {
    renderPanel({ osc1Range: 'ft32' })
    const knob = screen.getAllByRole('slider', { name: 'Range' })[0]!
    expect(knob.getAttribute('aria-valuetext')).toBe("32'")
  })
})

describe('turning a continuous knob', () => {
  /* Unmounts first: a second panel left mounted alongside the first would make
     every lookup ambiguous rather than failing where the mistake is. */
  const nudge = (key: string, shiftKey = false) => {
    cleanup()
    const { changes } = renderPanel({ osc2Frequency: 0 })
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Oscillator-2' }), { key, shiftKey })
    return changes[0]!.value as number
  }

  test('an arrow moves one step', () => {
    expect(nudge('ArrowUp')).toBe(0.01)
    expect(nudge('ArrowDown')).toBe(-0.01)
  })

  test('shift moves ten, which is one unit of the displayed precision', () => {
    expect(nudge('ArrowUp', true)).toBeCloseTo(0.1, 10)
  })

  test('Home and End go to the ends of the travel, not of the printed scale', () => {
    /* The knob prints to 7 and reaches 8. */
    expect(nudge('End')).toBe(8)
    expect(nudge('Home')).toBe(-8)
  })
})

describe('a switch', () => {
  test('clicking it moves to the other position', () => {
    const { changes } = renderPanel({ filterModulation: 'on' })
    fireEvent.click(screen.getByRole('switch', { name: 'Filter Modulation' }))
    expect(changes[0]!.value).toBe('off')
  })

  test('and back again', () => {
    const { changes } = renderPanel({ filterModulation: 'off' })
    fireEvent.click(screen.getByRole('switch', { name: 'Filter Modulation' }))
    expect(changes[0]!.value).toBe('on')
  })

  test('reports which way it is set', () => {
    renderPanel({ filterModulation: 'on' })
    expect(screen.getByRole('switch', { name: 'Filter Modulation' }).getAttribute('aria-checked'))
      .toBe('true')
  })
})

describe('typing a value in', () => {
  test('double click opens a box holding the stored value, and Enter commits', () => {
    const { changes } = renderPanel({ osc2Frequency: 3.23 })
    fireEvent.doubleClick(screen.getByRole('slider', { name: 'Oscillator-2' }))

    const input = screen.getByLabelText('Type a value') as HTMLInputElement
    /* The stored value, not the displayed one — opening and closing must not
       quietly round 3.23 to 3.2. */
    expect(input.value).toBe('3.23')

    fireEvent.change(input, { target: { value: '-4.5' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(changes.at(-1)!.value).toBe(-4.5)
  })

  test('Escape abandons without changing anything', () => {
    const { changes } = renderPanel({ osc2Frequency: 3.23 })
    fireEvent.doubleClick(screen.getByRole('slider', { name: 'Oscillator-2' }))
    const input = screen.getByLabelText('Type a value')
    fireEvent.change(input, { target: { value: '-4.5' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(changes).toHaveLength(0)
  })

  test('text that makes no sense abandons rather than substituting a default', () => {
    const { changes } = renderPanel({ osc2Frequency: 3.23 })
    fireEvent.doubleClick(screen.getByRole('slider', { name: 'Oscillator-2' }))
    const input = screen.getByLabelText('Type a value')
    fireEvent.change(input, { target: { value: 'not a number' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(changes).toHaveLength(0)
  })

  test('a step knob offers its positions to choose from instead', () => {
    const { changes } = renderPanel({ osc1Range: 'ft8' })
    fireEvent.doubleClick(screen.getAllByRole('slider', { name: 'Range' })[0]!)

    const picker = screen.getByLabelText('Choose a position') as HTMLSelectElement
    expect([...picker.options].map((option) => option.value)).toEqual([
      'lo',
      'ft32',
      'ft16',
      'ft8',
      'ft4',
      'ft2',
    ])

    fireEvent.change(picker, { target: { value: 'ft32' } })
    expect(changes.at(-1)!).toEqual({ id: 'osc1Range', value: 'ft32' })
  })
})
