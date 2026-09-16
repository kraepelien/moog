import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Keyboard } from '../src/components/keyboard/Keyboard.tsx'
import { createSynth, type Synth } from '../src/audio/engine.ts'
import { KEY_COUNT, noteName } from '../src/audio/notes.ts'
import { defaultValues } from '../src/controls/registry.ts'
import { panelRegistry } from '../src/controls/panel.ts'
import { fakeContext } from './fakeAudio.ts'

/* Driven the way a person drives it, because a keyboard that draws correctly
   and sounds nothing is invisible to a test that only calls the engine. */

afterEach(cleanup)

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

  /* Nothing may open an audio context before somebody asks for a sound. */
  test('is silent until a key is touched', () => {
    const context = fakeContext()
    draw(createSynth(() => context))
    expect(context.nodes).toHaveLength(0)
  })
})
