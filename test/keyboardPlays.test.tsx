import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Keyboard } from '@components/keyboard/Keyboard.tsx'
import { createSynth, type Synth } from '@audio/engine.ts'
import { KEY_COUNT, noteName } from '@audio/notes.ts'
import { defaultValues } from '@controls/registry.ts'
import { panelRegistry } from '@controls/panel.ts'
import { fakeContext } from './fakeAudio.ts'

/* Driven the way a person drives it, because a keyboard that draws correctly
   and sounds nothing is invisible to a test that only calls the engine. */

afterEach(() => {
  cleanup()
  delete (navigator as { requestMIDIAccess?: unknown }).requestMIDIAccess
})

/* A MIDI device that is not there. happy-dom has no Web MIDI, and a real one
   would need a permission and a socket; what the component actually has to get
   right is that it asks at the right moment and routes what arrives. */
const fakeMidi = () => {
  const ports: { onmidimessage: ((event: { data: number[] }) => void) | null }[] = [
    { onmidimessage: null },
  ]
  const access = {
    inputs: { forEach: (fn: (port: (typeof ports)[number]) => void) => ports.forEach(fn) },
    onstatechange: null as (() => void) | null,
  }
  let asked = 0
  Object.defineProperty(navigator, 'requestMIDIAccess', {
    configurable: true,
    value: () => {
      asked += 1
      return Promise.resolve(access)
    },
  })
  return {
    ports,
    asked: () => asked,
    /* A message from a device is not a React event, so nothing else wraps the
       render it causes. */
    send: (data: number[]) => act(() => ports[0]!.onmidimessage?.({ data })),
  }
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

const playable = (): Synth => createSynth(() => fakeContext())

const draw = (instrument: Synth) =>
  render(<Keyboard values={defaultValues(panelRegistry)} instrument={instrument} />)

describe('the drawn keyboard', () => {
  test('offers every key by the note it sounds', () => {
    draw(playable())
    expect(screen.getAllByRole('button')).toHaveLength(KEY_COUNT)
    expect(screen.getByRole('button', { name: noteName(0) })).toBeDefined()
    expect(screen.getByRole('button', { name: 'A4' })).toBeDefined()
  })

  test('sounds a key pressed with a pointer, and stops when it comes up', () => {
    const instrument = playable()
    draw(instrument)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'A4' }))
    expect(instrument.snapshot().sounding).toBe(40)
    fireEvent.pointerUp(window)
    expect(instrument.snapshot().held).toEqual([])
  })

  test('sounds a key reached from the computer keyboard', () => {
    const instrument = playable()
    draw(instrument)
    const key = screen.getByRole('button', { name: 'C5' })
    fireEvent.keyDown(key, { key: ' ' })
    expect(instrument.snapshot().sounding).toBe(43)
    fireEvent.keyUp(key, { key: ' ' })
    expect(instrument.snapshot().held).toEqual([])
  })

  /* A finger dragged along the keys is a glissando, and the key it leaves has
     to stop when the key it reaches starts. */
  test('sounds each key a drag passes over, one at a time', () => {
    const instrument = playable()
    draw(instrument)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'F1' }))
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'G1' }), { buttons: 1 })
    expect(instrument.snapshot().held).toEqual([2])
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'A1' }), { buttons: 1 })
    expect(instrument.snapshot().held).toEqual([4])
  })

  test('ignores a pointer passing over with no button down', () => {
    const instrument = playable()
    draw(instrument)
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'G1' }), { buttons: 0 })
    expect(instrument.snapshot().held).toEqual([])
  })

  test('says which keys are down', () => {
    const instrument = playable()
    draw(instrument)
    const key = screen.getByRole('button', { name: 'A4' })
    expect(key.getAttribute('aria-pressed')).toBe('false')
    fireEvent.pointerDown(key)
    expect(screen.getByRole('button', { name: 'A4' }).getAttribute('aria-pressed')).toBe('true')
  })

  test('plays from the computer keyboard', () => {
    const instrument = playable()
    draw(instrument)
    fireEvent.keyDown(document.body, { key: 'z' })
    expect(noteName(instrument.snapshot().sounding!)).toBe('C3')
    fireEvent.keyDown(document.body, { key: 'q' })
    /* Two keys held, and the one pressed last is the one that sounds. */
    expect(instrument.snapshot().held).toHaveLength(2)
    expect(noteName(instrument.snapshot().sounding!)).toBe('C4')
    fireEvent.keyUp(document.body, { key: 'q' })
    /* Handed back to what is still down rather than falling silent. */
    expect(noteName(instrument.snapshot().sounding!)).toBe('C3')
    fireEvent.keyUp(document.body, { key: 'z' })
    expect(instrument.snapshot().held).toEqual([])
  })

  test('shifts octave without playing anything', () => {
    const instrument = playable()
    draw(instrument)
    fireEvent.keyDown(document.body, { key: ']' })
    expect(instrument.snapshot().held).toEqual([])
    fireEvent.keyDown(document.body, { key: 'z' })
    expect(noteName(instrument.snapshot().sounding!)).toBe('C4')
  })

  /* Somebody naming a patch is typing words. A synthesiser that answered the
     Notes field would be unusable. */
  test('stays quiet while a field is being typed into', () => {
    const instrument = playable()
    const { container } = draw(instrument)
    const field = document.createElement('input')
    container.append(field)
    fireEvent.keyDown(field, { key: 'z' })
    expect(instrument.snapshot().held).toEqual([])
  })

  test('ignores a keystroke that is a shortcut', () => {
    const instrument = playable()
    draw(instrument)
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })
    expect(instrument.snapshot().held).toEqual([])
  })

  /* A permission prompt that greets somebody before they have touched anything
     is one they have no reason to grant, so it waits for the first key. */
  test('asks for MIDI on the first key played, and only once', async () => {
    const midi = fakeMidi()
    const instrument = playable()
    draw(instrument)
    expect(midi.asked()).toBe(0)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'A4' }))
    await settled()
    expect(midi.asked()).toBe(1)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'C5' }))
    expect(midi.asked()).toBe(1)
  })

  test('plays notes arriving from a MIDI keyboard', async () => {
    const midi = fakeMidi()
    const instrument = playable()
    draw(instrument)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'A4' }))
    fireEvent.pointerUp(window)
    await settled()

    midi.send([0x90, 60, 100])
    expect(noteName(instrument.snapshot().sounding!)).toBe('C4')
    midi.send([0x90, 60, 0])
    expect(instrument.snapshot().held).toEqual([])
  })

  test('moves the wheels on the panel rather than the keyboard', async () => {
    const midi = fakeMidi()
    const instrument = playable()
    const moved: [string, unknown][] = []
    render(
      <Keyboard
        values={defaultValues(panelRegistry)}
        instrument={instrument}
        onPanelChange={(id, value) => moved.push([id, value])}
      />,
    )
    fireEvent.pointerDown(screen.getAllByRole('button', { name: 'A4' })[0]!)
    fireEvent.pointerUp(window)
    await settled()

    midi.send([0xe0, 0x00, 0x40])
    midi.send([0xb0, 1, 127])
    expect(moved).toEqual([
      ['pitchWheel', 0],
      ['modWheel', 10],
    ])
  })

  /* Nothing may open an audio context before somebody asks for a sound. */
  test('is silent until a key is touched', () => {
    const context = fakeContext()
    draw(createSynth(() => context))
    expect(context.nodes).toHaveLength(0)
  })
})
