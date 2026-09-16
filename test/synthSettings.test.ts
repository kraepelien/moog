import { describe, expect, test } from 'bun:test'
import { defaultValues } from '../src/controls/registry.ts'
import { panelRegistry } from '../src/controls/panel.ts'
import type { ControlValue } from '../src/controls/types.ts'
import {
  SILENT,
  contourSettings,
  filterSettings,
  glideSecondsPerOctave,
  masterGain,
  modulationSettings,
  oscillatorSettings,
  settingsFrom,
} from '../src/audio/settings.ts'

/* What the instrument does, not the arithmetic that gets it there: a test that
   restated the multiplication would pass whatever the multiplication was. */

const panel = (overrides: Record<string, ControlValue> = {}) => ({
  ...defaultValues(panelRegistry),
  ...overrides,
})

describe('the oscillators', () => {
  test('sound the note the key names at 8ft, and an octave apart per detent', () => {
    const cents = (range: string) =>
      oscillatorSettings(panel({ osc1Range: range }), 1).detuneCents
    expect(cents('ft8')).toBe(0)
    expect(cents('ft16')).toBe(-1200)
    expect(cents('ft32')).toBe(-2400)
    expect(cents('ft4')).toBe(1200)
    expect(cents('ft2')).toBe(2400)
  })

  test('put LO below every printed foot marking', () => {
    expect(oscillatorSettings(panel({ osc3Range: 'lo' }), 3).detuneCents).toBeLessThan(-2400)
  })

  test('tune together and detune apart', () => {
    /* Tune moves the whole instrument; the frequency knobs move one oscillator
       against the other two, which is what they are for. */
    const tuned = panel({ tune: 1 })
    expect(oscillatorSettings(tuned, 1).detuneCents).toBe(100)
    expect(oscillatorSettings(tuned, 2).detuneCents).toBe(100)

    const detuned = panel({ osc2Frequency: 7 })
    expect(oscillatorSettings(detuned, 1).detuneCents).toBe(0)
    expect(oscillatorSettings(detuned, 2).detuneCents).toBe(700)
  })

  test('are silent when switched out of the mixer, whatever the volume says', () => {
    expect(oscillatorSettings(panel({ osc1Volume: 10, osc1Enable: 'on' }), 1).level)
      .toBeGreaterThan(0)
    expect(oscillatorSettings(panel({ osc1Volume: 10, osc1Enable: 'off' }), 1).level).toBe(0)
  })

  test('let only Oscillator-3 leave the keyboard', () => {
    expect(oscillatorSettings(panel({ osc3Control: 'lo' }), 3).tracksKeyboard).toBe(false)
    expect(oscillatorSettings(panel({ osc3Control: 'osc3' }), 3).tracksKeyboard).toBe(true)
    expect(oscillatorSettings(panel({ osc3Control: 'lo' }), 1).tracksKeyboard).toBe(true)
    expect(oscillatorSettings(panel({ osc3Control: 'lo' }), 2).tracksKeyboard).toBe(true)
  })

  test('carry the waveform the knob is on, and a real one for a value that is not', () => {
    expect(oscillatorSettings(panel({ osc1Waveform: 'narrowPulse' }), 1).wave).toBe('narrowPulse')
    expect(oscillatorSettings(panel({ osc3Waveform: 'reverseSawtooth' }), 3).wave)
      .toBe('reverseSawtooth')
    expect(oscillatorSettings(panel({ osc1Waveform: 'nonsense' }), 1).wave).toBe('triangle')
  })
})

describe('the filter', () => {
  test('opens as the knob turns up', () => {
    const open = filterSettings(panel({ cutoffFrequency: 4 })).cutoffHz
    const shut = filterSettings(panel({ cutoffFrequency: -4 })).cutoffHz
    expect(open).toBeGreaterThan(shut)
  })

  test('stays inside the audible band at both ends of the dial', () => {
    expect(filterSettings(panel({ cutoffFrequency: 5 })).cutoffHz).toBeLessThanOrEqual(20000)
    expect(filterSettings(panel({ cutoffFrequency: -5 })).cutoffHz).toBeGreaterThanOrEqual(20)
  })

  test('tracks the keyboard by a third per switch, and wholly with both', () => {
    const tracking = (one: string, two: string) =>
      filterSettings(panel({ keyboardControl1: one, keyboardControl2: two })).keyboardTracking
    expect(tracking('off', 'off')).toBe(0)
    expect(tracking('on', 'off')).toBeCloseTo(1 / 3, 10)
    expect(tracking('off', 'on')).toBeCloseTo(2 / 3, 10)
    expect(tracking('on', 'on')).toBeCloseTo(1, 10)
  })

  test('sweeps further the further Amount of Contour is turned', () => {
    expect(filterSettings(panel({ amountOfContour: 0 })).contourCents).toBe(0)
    expect(filterSettings(panel({ amountOfContour: 10 })).contourCents).toBeGreaterThan(
      filterSettings(panel({ amountOfContour: 5 })).contourCents,
    )
  })

  test('rings harder as Emphasis comes up', () => {
    expect(filterSettings(panel({ filterEmphasis: 10 })).q).toBeGreaterThan(
      filterSettings(panel({ filterEmphasis: 0 })).q,
    )
  })
})

describe('the contours', () => {
  test('take their times from the knobs, which already hold milliseconds', () => {
    const shape = contourSettings(panel({ loudnessAttackTime: 800, loudnessDecayTime: 200 }), 'loudness')
    expect(shape.attackSeconds).toBe(0.8)
    expect(shape.decaySeconds).toBe(0.2)
  })

  test('release over the decay time only while the Decay switch is on', () => {
    const held = { filterDecayTime: 1000, loudnessDecayTime: 1000 }
    const on = contourSettings(panel({ ...held, decayEnable: 'on' }), 'loudness')
    const off = contourSettings(panel({ ...held, decayEnable: 'off' }), 'loudness')
    expect(on.releaseSeconds).toBe(1)
    expect(off.releaseSeconds).toBeLessThan(0.05)
    /* Never nothing: an instant cut is a click, and the instrument does not
       click. */
    expect(off.releaseSeconds).toBeGreaterThan(0)
    expect(contourSettings(panel({ ...held, decayEnable: 'on' }), 'filter').releaseSeconds).toBe(1)
  })
})

describe('the modulation bus', () => {
  test('is silent with the wheel down, whatever is routed', () => {
    const wide = panel({ oscillatorModulation: 'on', filterModulation: 'on', modulationMix: 5 })
    expect(modulationSettings({ ...wide, modWheel: 0 }).toPitchCents).toBe(0)
    expect(modulationSettings({ ...wide, modWheel: 0 }).toCutoffCents).toBe(0)
    expect(modulationSettings({ ...wide, modWheel: 10 }).toPitchCents).toBeGreaterThan(0)
  })

  test('goes nowhere the routing switches are off', () => {
    const up = { modWheel: 10 }
    expect(modulationSettings(panel({ ...up, oscillatorModulation: 'off' })).toPitchCents).toBe(0)
    expect(modulationSettings(panel({ ...up, filterModulation: 'off' })).toCutoffCents).toBe(0)
  })

  test('mixes from all of one source to all of the other', () => {
    expect(modulationSettings(panel({ modulationMix: 0 })).mix).toBe(0)
    expect(modulationSettings(panel({ modulationMix: 10 })).mix).toBe(1)
  })

  test('names the two sources the switches choose', () => {
    const chosen = panel({ modulationSourceA: 'filterEg', modulationSourceB: 'lfo' })
    expect(modulationSettings(chosen).sourceA).toBe('filterEg')
    expect(modulationSettings(chosen).sourceB).toBe('lfo')
    expect(modulationSettings(panel()).sourceA).toBe('osc3')
    expect(modulationSettings(panel()).sourceB).toBe('noise')
  })

  test('runs the LFO faster as its knob comes up', () => {
    expect(modulationSettings(panel({ lfoRate: 10 })).lfoHz).toBeGreaterThan(
      modulationSettings(panel({ lfoRate: 0 })).lfoHz,
    )
  })
})

describe('playing and output', () => {
  test('glides only when the switch is on, and further the higher the knob', () => {
    expect(glideSecondsPerOctave(panel({ glide: 10, glideEnable: 'off' }))).toBe(0)
    expect(glideSecondsPerOctave(panel({ glide: 10, glideEnable: 'on' }))).toBeGreaterThan(
      glideSecondsPerOctave(panel({ glide: 2, glideEnable: 'on' })),
    )
  })

  test('bends with the pitch wheel, and sits still at its rest', () => {
    expect(settingsFrom(panel({ pitchWheel: 0 })).bendCents).toBe(0)
    expect(settingsFrom(panel({ pitchWheel: 5 })).bendCents).toBe(500)
    expect(settingsFrom(panel({ pitchWheel: -5 })).bendCents).toBe(-500)
  })

  test('is silent with Main Output off', () => {
    expect(masterGain(panel({ mainVolume: 10, mainOutput: 'off' }))).toBe(0)
    expect(masterGain(panel({ mainVolume: 10, mainOutput: 'on' }))).toBeGreaterThan(0)
  })

  test('sounds A-440 only when its switch is thrown', () => {
    expect(settingsFrom(panel()).a440).toBe(false)
    expect(settingsFrom(panel({ a440: 'on' })).a440).toBe(true)
  })
})

describe('what makes no sound here', () => {
  test('is a control the panel really has', () => {
    for (const id of Object.keys(SILENT)) {
      expect(panelRegistry.control(id), id).toBeDefined()
    }
  })

  /* Proving the silence rather than commenting it: move each of them through its
     whole travel and the instrument is described identically. */
  test('changes nothing about the sound, wherever it is set', () => {
    const base = JSON.stringify(settingsFrom(panel()))
    for (const id of Object.keys(SILENT)) {
      for (const value of [0, 5, 10, 'on', 'off']) {
        expect(JSON.stringify(settingsFrom(panel({ [id]: value }))), `${id}=${value}`).toBe(base)
      }
    }
  })
})

describe('a panel that has been damaged', () => {
  /* Values arrive as raw JSON, so the reading has to be total: a missing or
     nonsense value falls to silent or neutral rather than to NaN, which would
     travel into an AudioParam and throw. */
  test('still describes an instrument', () => {
    const wrecked = settingsFrom({ osc1Volume: 'loud', cutoffFrequency: null, tune: undefined })
    expect(Number.isFinite(wrecked.filter.cutoffHz)).toBe(true)
    expect(wrecked.oscillators[0]!.level).toBe(0)
    expect(Number.isFinite(wrecked.oscillators[0]!.detuneCents)).toBe(true)
  })

  test('describes one from nothing at all', () => {
    const empty = settingsFrom({})
    expect(Number.isFinite(empty.masterGain)).toBe(true)
    expect(empty.oscillators).toHaveLength(3)
  })
})
