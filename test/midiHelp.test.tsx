import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import { MidiHelp } from '../src/components/MidiHelp.tsx'

afterEach(() => {
  cleanup()
  delete (navigator as { requestMIDIAccess?: unknown }).requestMIDIAccess
})

const grant = () => {
  Object.defineProperty(navigator, 'requestMIDIAccess', {
    configurable: true,
    value: () => Promise.resolve({}),
  })
}

describe('the MIDI guide', () => {
  test('leads with the step that looks like a fault', () => {
    /* Everybody plugs a keyboard in, plays it, hears nothing, and concludes the
       app is broken. It is waiting for a gesture, and this is where that is
       said. */
    render(<MidiHelp open onClose={() => {}} />)
    expect(screen.getByText(/Play one key on screen first/i)).toBeDefined()
  })

  test('says outright when the browser cannot do it', () => {
    /* happy-dom has no Web MIDI, which is the same position Safari is in. */
    render(<MidiHelp open onClose={() => {}} />)
    expect(screen.getByText(/does not offer Web MIDI/i)).toBeDefined()
  })

  test('drops that warning where the browser can', () => {
    grant()
    render(<MidiHelp open onClose={() => {}} />)
    expect(screen.queryByText(/does not offer Web MIDI/i)).toBe(null)
    expect(screen.getByText(/Play one key on screen first/i)).toBeDefined()
  })

  test('says where each thing a controller sends ends up', () => {
    render(<MidiHelp open onClose={() => {}} />)
    expect(screen.getByText(/Pitch bend/)).toBeDefined()
    expect(screen.getByText(/marks the draft unsaved/)).toBeDefined()
    /* The one that surprises people about this instrument in particular. */
    expect(screen.getByText(/no velocity to give it to/)).toBeDefined()
  })

  test('shows nothing at all while it is closed', () => {
    render(<MidiHelp open={false} onClose={() => {}} />)
    expect(screen.queryByText(/Play one key on screen first/i)).toBe(null)
  })
})
