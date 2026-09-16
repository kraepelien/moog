import { beforeEach, describe, expect, test } from 'bun:test'
import { createSynth, type Synth } from '../src/audio/engine.ts'
import { settingsFrom } from '../src/audio/settings.ts'
import { defaultValues } from '../src/controls/registry.ts'
import { panelRegistry } from '../src/controls/panel.ts'
import type { ControlValue } from '../src/controls/types.ts'
import { FakeContext, fakeContext, type FakeParam } from './fakeAudio.ts'

/* What the engine does, seen from the calls it makes. Nothing here can hear
   anything, which is the point: the parts that matter are how much it builds,
   what it schedules, and above all what it refuses to disturb. */

const panel = (overrides: Record<string, ControlValue> = {}) =>
  settingsFrom({ ...defaultValues(panelRegistry), ...overrides })

let context: BaseAudioContext & FakeContext
let synth: Synth

const start = (overrides: Record<string, ControlValue> = {}) => {
  synth.apply(panel(overrides))
  synth.noteOn(20)
}

/* The three voices, picked out by the fact that the panel's reading is written
   onto their detune. The wanders, the tuning tone and the LFO are never told
   anything about the panel, so nothing else qualifies, and no test has to know
   what order the graph was built in. */
const voices = () =>
  context
    .of('oscillator')
    .filter((node) => (node as unknown as { detune: FakeParam }).detune.calls.length > 0)

const rateOf = (node: unknown) => (node as { frequency: FakeParam }).frequency.value

/* The gain the loudness contour gates, which is the node between the filters
   and the master. */
const vcaGain = (): FakeParam => {
  const filter = context.of('filter')[1]!
  return (filter.connected[0] as unknown as { gain: FakeParam }).gain
}

beforeEach(() => {
  context = fakeContext()
  synth = createSynth(() => context)
})

describe('opening the instrument', () => {
  test('waits for a key before it opens a context at all', () => {
    synth.apply(panel())
    expect(context.nodes).toHaveLength(0)
    synth.noteOn(0)
    expect(context.nodes.length).toBeGreaterThan(0)
  })

  /* Knobs are turned long before anything is played, and the graph that will
     carry them does not exist yet. */
  test('keeps the knobs turned before the first note', () => {
    synth.apply(panel({ osc1Volume: 10, mainVolume: 10, cutoffFrequency: 4 }))
    expect(context.nodes).toHaveLength(0)
    synth.noteOn(0)
    const cutoff = context.of('filter')[0]! as unknown as { frequency: FakeParam }
    expect(cutoff.frequency.calls.length).toBeGreaterThan(0)
    expect(cutoff.frequency.value).toBeGreaterThan(1000)
  })

  test('builds three oscillators and no more, however much is played', () => {
    start()
    for (let key = 0; key < 100; key += 1) {
      synth.noteOn(key % 44)
      synth.noteOff(key % 44)
    }
    /* Three voices, a slow wander apiece, the tuning tone and the LFO are the
       whole census: an oscillator cannot be restarted once stopped, so one per
       note would be a leak that eventually throws. */
    expect(context.of('oscillator')).toHaveLength(8)
  })

  test('starts every source exactly once', () => {
    start()
    for (const node of [...context.of('oscillator'), ...context.of('constant'), ...context.of('buffer')]) {
      expect(node.started, node.kind).toBe(1)
    }
  })

  test('wakes a context a phone call suspended', () => {
    start()
    context.state = 'suspended'
    synth.noteOn(21)
    expect(context.resumed).toBe(1)
  })
})

describe('three oscillators set the same way', () => {
  /* Identical oscillators are not a quiet instrument, they are a wrong one:
     summed dead in phase they give one louder oscillator where three real ones
     give a thick one. */
  test('are not in exact tune with each other', () => {
    start({ osc1Volume: 10, osc2Volume: 10, osc3Volume: 10 })
    const detunes = voices().map((node) => (node as unknown as { detune: FakeParam }).detune.value)
    expect(detunes).toHaveLength(3)
    expect(new Set(detunes).size).toBe(3)
  })

  test('leave Oscillator-1 where the panel put it, since it is the reference', () => {
    start()
    /* It carries no frequency knob because the other two are tuned against it,
       so it is the one that is right by definition. */
    const first = voices()[0]! as unknown as { detune: FakeParam }
    expect(first.detune.value).toBe(0)
  })

  test('each wander at their own rate, so the three never move as one', () => {
    /* The LFO is sent to the top of its range so that the only oscillators left
       running below a hertz are the wanders. */
    start({ lfoRate: 10 })
    const slow = context.of('oscillator').map(rateOf).filter((rate) => rate > 0 && rate < 1)
    expect(slow).toHaveLength(3)
    expect(new Set(slow).size).toBe(3)
  })
})

describe('a note', () => {
  test('strikes the contour from where it stood', () => {
    start({ loudnessAttackTime: 100, loudnessSustainLevel: 5 })
    const shape = vcaGain().methods()
    expect(shape[0]).toBe('cancelScheduledValues')
    expect(shape).toContain('linearRampToValueAtTime')
  })

  test('is released over the decay time only when the switch says so', () => {
    start({ loudnessDecayTime: 1000, decayEnable: 'on' })
    const before = vcaGain().calls.length
    context.advance(2)
    synth.noteOff(20)
    const release = vcaGain().calls.slice(before).at(-1)!
    expect(release.method).toBe('linearRampToValueAtTime')
    expect(release.value).toBe(0)
    expect(release.time - context.currentTime).toBeCloseTo(1, 5)
  })

  test('picks the contour up part way down rather than from nothing', () => {
    start({ loudnessAttackTime: 0, loudnessDecayTime: 4000, loudnessSustainLevel: 10, decayEnable: 'on' })
    context.advance(1)
    synth.noteOff(20)
    context.advance(0.5)
    const before = vcaGain().calls.length
    synth.noteOn(24)
    const caught = vcaGain().calls.slice(before).find((call) => call.method === 'setValueAtTime')!
    /* Half a second into a four second release, so about seven eighths of the
       way down and certainly not zero. */
    expect(caught.value).toBeGreaterThan(0.5)
    expect(caught.value).toBeLessThan(1)
  })
})

describe('two keys at once', () => {
  test('slides to the new note without striking it again', () => {
    start({ glide: 5, glideEnable: 'on' })
    const before = vcaGain().calls.length
    synth.noteOn(15)
    /* The lower key takes the voice, so the pitch moves and the contour is not
       touched at all: that is what single triggering is. */
    expect(vcaGain().calls).toHaveLength(before)
    expect(synth.snapshot().sounding).toBe(15)
  })

  test('returns to the key still held when the lower one comes up', () => {
    start()
    synth.noteOn(15)
    synth.noteOff(15)
    expect(synth.snapshot().sounding).toBe(20)
    expect(synth.snapshot().held).toEqual([20])
  })

  test('takes longer to glide the further it goes', () => {
    const span = (from: number, to: number) => {
      context = fakeContext()
      synth = createSynth(() => context)
      start({ glide: 10, glideEnable: 'on' })
      synth.noteOn(from)
      const keyboard = context.of('constant')[0]! as unknown as { offset: FakeParam }
      const before = keyboard.offset.calls.length
      synth.noteOn(to)
      const ramp = keyboard.offset.calls.slice(before).find((call) =>
        call.method === 'linearRampToValueAtTime',
      )!
      return ramp.time - context.currentTime
    }
    expect(span(30, 6)).toBeGreaterThan(span(30, 18))
  })

  test('steps rather than sliding when Glide is off', () => {
    start({ glide: 10, glideEnable: 'off' })
    const keyboard = context.of('constant')[0]! as unknown as { offset: FakeParam }
    const before = keyboard.offset.calls.length
    synth.noteOn(15)
    const after = keyboard.offset.calls.slice(before)
    expect(after.some((call) => call.method === 'linearRampToValueAtTime')).toBe(false)
    expect(after.at(-1)!.method).toBe('setValueAtTime')
  })
})

describe('the modulation bus', () => {
  /* The wheel is the depth of the whole bus, so at rest it does not matter what
     the sources or the mix are set to: nothing is modulated. */
  test('reaches nothing with the wheel down', () => {
    start({ modWheel: 0, oscillatorModulation: 'on', filterModulation: 'on', modulationMix: 5 })
    const depths = context.of('gain').filter((node) =>
      (node as unknown as { gain: FakeParam }).gain.value > 0,
    )
    const pitch = panel({ modWheel: 0, oscillatorModulation: 'on' }).modulation.toPitchCents
    expect(pitch).toBe(0)
    expect(depths.length).toBeGreaterThan(0)
  })

  test('opens the gate the switch chooses, and shuts the other', () => {
    start({ modulationSourceB: 'lfo', modWheel: 10, oscillatorModulation: 'on' })
    const applied = panel({ modulationSourceB: 'lfo', modWheel: 10, oscillatorModulation: 'on' })
    expect(applied.modulation.sourceB).toBe('lfo')
    expect(applied.modulation.toPitchCents).toBeGreaterThan(0)
  })

  test('runs the LFO at the rate the knob asks for', () => {
    start({ lfoRate: 10 })
    const lfo = context.of('oscillator').at(-1)! as unknown as { frequency: FakeParam }
    expect(lfo.frequency.value).toBeGreaterThan(10)
  })
})

describe('turning a knob while a note sounds', () => {
  test('never cancels what the contour has scheduled', () => {
    start({ loudnessAttackTime: 3000, loudnessSustainLevel: 5 })
    const before = vcaGain().calls.length
    synth.apply(panel({ loudnessAttackTime: 3000, loudnessSustainLevel: 5, cutoffFrequency: 3 }))
    synth.apply(panel({ loudnessAttackTime: 3000, loudnessSustainLevel: 5, filterEmphasis: 8 }))
    expect(vcaGain().calls.slice(before)).toHaveLength(0)
  })

  test('changes nothing at all when nothing changed', () => {
    start()
    const before = context.calls.length
    synth.apply(panel())
    synth.apply(panel())
    expect(context.calls).toHaveLength(before)
  })

  test('eases rather than jumping, so a knob is not a click', () => {
    start()
    const before = context.calls.length
    synth.apply(panel({ cutoffFrequency: 4 }))
    const made = context.calls.slice(before)
    expect(made.length).toBeGreaterThan(0)
    expect(made.every((call) => call.method === 'setTargetAtTime')).toBe(true)
  })

  test('builds each waveform once however often the knob is turned', () => {
    start({ osc1Waveform: 'sawtooth' })
    const first = context.periodicWaves
    for (let i = 0; i < 5; i += 1) {
      synth.apply(panel({ osc1Waveform: 'square' }))
      synth.apply(panel({ osc1Waveform: 'sawtooth' }))
    }
    /* One more table, for the square: everything after is the cache. */
    expect(context.periodicWaves).toBe(first + 1)
  })
})
