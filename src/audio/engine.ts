/* The signal path, built once and then only adjusted.
 *
 * Three rules shape everything here.
 *
 * Pitch and cutoff are each wanted by several things at once: the note, glide,
 * tune, range and the frequency knobs all move an oscillator, and the knob,
 * keyboard tracking and the contour all move the filter. One AudioParam cannot
 * be written by all of them without one destroying another's schedule, so the
 * panel's own static reading goes on `frequency` and everything summed or moving
 * goes on `detune`, in cents, which other nodes can be connected into and which
 * adds what it receives to its own value. Keyboard tracking is then a plain gain
 * on a voltage already in cents, and glide is one ramp on one node that every
 * oscillator and the filter see together, which is what the instrument's single
 * keyboard voltage is.
 *
 * Nothing is created per note. Oscillators cannot be restarted once stopped, so
 * they run for the life of the context and the contours gate them.
 *
 * A browser will not start an audio context outside a gesture, so the context is
 * a factory called on the first key press rather than a value made at import.
 */

import { IDLE, levelAt, stageAt, type Running } from './envelope.ts'
import { LOWEST_MIDI, centsForKey, hzForMidi } from './notes.ts'
import { cal } from './calibration.ts'
import { partialsFor, type WaveId } from './partials.ts'
import { sounding, trigger } from './priority.ts'
import type { EnvelopeSettings, Settings } from './settings.ts'

export interface SynthState {
  readonly held: readonly number[]
  readonly sounding: number | null
  readonly running: boolean
}

export interface Synth {
  noteOn(key: number): void
  noteOff(key: number): void
  allOff(): void
  apply(settings: Settings): void
  snapshot(): SynthState
  subscribe(listener: () => void): () => void
  close(): void
}

export type OpenContext = () => BaseAudioContext

const SMOOTHING = cal.smoothingMs / 1000

/* Two seconds is long enough that the loop is not heard as a pitch. */
const NOISE_SECONDS = 2

function whiteNoise(context: BaseAudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, context.sampleRate * NOISE_SECONDS, context.sampleRate)
  const samples = buffer.getChannelData(0)
  for (let i = 0; i < samples.length; i += 1) samples[i] = Math.random() * 2 - 1
  return buffer
}

/* Pink noise by Voss-McCartney: octave bands each refreshed half as often as the
   one above, which is what gives equal energy per octave rather than per hertz. */
function pinkNoise(context: BaseAudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, context.sampleRate * NOISE_SECONDS, context.sampleRate)
  const samples = buffer.getChannelData(0)
  const rows = new Float32Array(16)
  let running = 0
  for (let i = 0; i < samples.length; i += 1) {
    /* Which bands change on this sample: the lowest set bit of the counter, so
       band n is refreshed every 2^n samples. */
    let bit = i === 0 ? 0 : Math.log2(i & -i)
    if (!Number.isFinite(bit)) bit = 0
    const row = Math.min(rows.length - 1, bit)
    running -= rows[row]!
    rows[row] = Math.random() * 2 - 1
    running += rows[row]!
    samples[i] = running / rows.length
  }
  return buffer
}

interface Graph {
  readonly context: BaseAudioContext
  readonly oscillators: readonly OscillatorNode[]
  readonly oscGains: readonly GainNode[]
  readonly tracking: readonly GainNode[]
  readonly keyboard: ConstantSourceNode
  readonly bend: ConstantSourceNode
  readonly noiseGain: GainNode
  readonly whiteGain: GainNode
  readonly pinkGain: GainNode
  readonly filters: readonly BiquadFilterNode[]
  readonly filterTracking: GainNode
  readonly contour: ConstantSourceNode
  readonly contourDepth: GainNode
  readonly vca: GainNode
  readonly master: GainNode
  readonly tone: OscillatorNode
  readonly toneGain: GainNode
  readonly waves: Map<WaveId, PeriodicWave>
}

export function createSynth(open: OpenContext = () => new AudioContext()): Synth {
  let graph: Graph | null = null
  let settings: Settings | null = null
  let applied: Settings | null = null
  let held: number[] = []
  let loudness: Running = IDLE
  let filterRun: Running = IDLE
  /* Where the keyboard voltage stands, so a glide can start from it without
     reading a parameter that may be mid-ramp. */
  let cents: number | null = null
  const listeners = new Set<() => void>()
  /* Rebuilt only when something about it changes: useSyncExternalStore compares
     snapshots by identity and would re-render without end on a fresh object. */
  let state: SynthState = { held: [], sounding: null, running: false }

  const announce = () => {
    state = { held, sounding: sounding(held), running: graph !== null }
    listeners.forEach((listener) => listener())
  }

  const build = (context: BaseAudioContext): Graph => {
    const waves = new Map<WaveId, PeriodicWave>()
    const keyboard = context.createConstantSource()
    keyboard.offset.value = 0
    const bend = context.createConstantSource()
    bend.offset.value = 0

    const master = context.createGain()
    master.gain.value = 0
    master.connect(context.destination)

    const vca = context.createGain()
    vca.gain.value = 0
    vca.connect(master)

    /* Two poles each, in series, for the instrument's four. The resonance sits
       on one section only: on both it would be squared, and a peak that steep is
       not what the Emphasis knob does. */
    const filters = [context.createBiquadFilter(), context.createBiquadFilter()]
    for (const filter of filters) filter.type = 'lowpass'
    filters[1]!.Q.value = 0.7
    filters[0]!.connect(filters[1]!)
    filters[1]!.connect(vca)

    const filterTracking = context.createGain()
    filterTracking.gain.value = 0
    keyboard.connect(filterTracking)
    const contour = context.createConstantSource()
    contour.offset.value = 0
    const contourDepth = context.createGain()
    contourDepth.gain.value = 0
    contour.connect(contourDepth)
    for (const filter of filters) {
      filterTracking.connect(filter.detune)
      contourDepth.connect(filter.detune)
    }

    const oscillators: OscillatorNode[] = []
    const oscGains: GainNode[] = []
    const tracking: GainNode[] = []
    for (let i = 0; i < 3; i += 1) {
      const oscillator = context.createOscillator()
      /* The bottom key at 8'. Everything else about this oscillator's pitch is
         summed into detune, so this is never written again. */
      oscillator.frequency.value = hzForMidi(LOWEST_MIDI)
      const track = context.createGain()
      track.gain.value = 1
      keyboard.connect(track)
      track.connect(oscillator.detune)
      bend.connect(oscillator.detune)
      const gain = context.createGain()
      gain.gain.value = 0
      oscillator.connect(gain)
      gain.connect(filters[0]!)
      oscillators.push(oscillator)
      oscGains.push(gain)
      tracking.push(track)
    }

    const noiseGain = context.createGain()
    noiseGain.gain.value = 0
    noiseGain.connect(filters[0]!)
    const whiteGain = context.createGain()
    const pinkGain = context.createGain()
    whiteGain.gain.value = 1
    pinkGain.gain.value = 0
    whiteGain.connect(noiseGain)
    pinkGain.connect(noiseGain)
    const white = context.createBufferSource()
    white.buffer = whiteNoise(context)
    white.loop = true
    white.connect(whiteGain)
    const pink = context.createBufferSource()
    pink.buffer = pinkNoise(context)
    pink.loop = true
    pink.connect(pinkGain)

    /* The tuning tone is not played from the keyboard and is not filtered, which
       is the whole point of it: it is a reference, not a voice. */
    const tone = context.createOscillator()
    tone.type = 'sine'
    tone.frequency.value = cal.a440
    const toneGain = context.createGain()
    toneGain.gain.value = 0
    tone.connect(toneGain)
    toneGain.connect(master)

    for (const node of [keyboard, bend, contour, ...oscillators, white, pink, tone]) node.start()

    return {
      context,
      oscillators,
      oscGains,
      tracking,
      keyboard,
      bend,
      noiseGain,
      whiteGain,
      pinkGain,
      filters,
      filterTracking,
      contour,
      contourDepth,
      vca,
      master,
      tone,
      toneGain,
      waves,
    }
  }

  const waveFor = (live: Graph, wave: WaveId): PeriodicWave => {
    const known = live.waves.get(wave)
    if (known) return known
    const { real, imag } = partialsFor(wave)
    const made = live.context.createPeriodicWave(real, imag)
    live.waves.set(wave, made)
    return made
  }

  /* Never a bare assignment: a parameter that jumps while the instrument is
     sounding is a click, and a knob is not a click. */
  const ease = (param: AudioParam, value: number, now: number) => {
    param.setTargetAtTime(value, now, SMOOTHING)
  }

  const applyTo = (live: Graph, next: Settings) => {
    const now = live.context.currentTime
    const was = applied
    next.oscillators.forEach((oscillator, index) => {
      const before = was?.oscillators[index]
      if (!before || before.wave !== oscillator.wave) {
        live.oscillators[index]!.setPeriodicWave(waveFor(live, oscillator.wave))
      }
      if (!before || before.detuneCents !== oscillator.detuneCents) {
        ease(live.oscillators[index]!.detune, oscillator.detuneCents, now)
      }
      if (!before || before.level !== oscillator.level) {
        ease(live.oscGains[index]!.gain, oscillator.level, now)
      }
      if (!before || before.tracksKeyboard !== oscillator.tracksKeyboard) {
        ease(live.tracking[index]!.gain, oscillator.tracksKeyboard ? 1 : 0, now)
      }
    })

    if (was?.noise.level !== next.noise.level) ease(live.noiseGain.gain, next.noise.level, now)
    if (was?.noise.pink !== next.noise.pink) {
      ease(live.whiteGain.gain, next.noise.pink ? 0 : 1, now)
      ease(live.pinkGain.gain, next.noise.pink ? 1 : 0, now)
    }

    if (was?.filter.cutoffHz !== next.filter.cutoffHz) {
      for (const filter of live.filters) ease(filter.frequency, next.filter.cutoffHz, now)
    }
    if (was?.filter.q !== next.filter.q) ease(live.filters[0]!.Q, next.filter.q, now)
    if (was?.filter.keyboardTracking !== next.filter.keyboardTracking) {
      ease(live.filterTracking.gain, next.filter.keyboardTracking, now)
    }
    if (was?.filter.contourCents !== next.filter.contourCents) {
      ease(live.contourDepth.gain, next.filter.contourCents, now)
    }

    if (was?.bendCents !== next.bendCents) ease(live.bend.offset, next.bendCents, now)
    if (was?.masterGain !== next.masterGain) ease(live.master.gain, next.masterGain, now)
    if (was?.a440 !== next.a440) ease(live.toneGain.gain, next.a440 ? 0.2 : 0, now)

    /* The one case where a knob reaches a running contour: the instrument's
       sustain moves the held level under your hand. Only while it is actually
       being held there, since in attack or decay the schedule already says where
       the level is going. */
    if (was && was.loudnessContour.sustain !== next.loudnessContour.sustain) {
      if (stageAt(loudness, next.loudnessContour, now) === 'sustain') {
        ease(live.vca.gain, next.loudnessContour.sustain, now)
      }
    }
    if (was && was.filterContour.sustain !== next.filterContour.sustain) {
      if (stageAt(filterRun, next.filterContour, now) === 'sustain') {
        ease(live.contour.offset, next.filterContour.sustain, now)
      }
    }

    applied = next
  }

  const strike = (param: AudioParam, run: Running, shape: EnvelopeSettings, now: number): Running => {
    const from = levelAt(run, shape, now)
    param.cancelScheduledValues(now)
    param.setValueAtTime(from, now)
    /* A ramp that ends where it starts is not scheduled at all, so an instant
       attack is set rather than ramped. */
    if (shape.attackSeconds > 0) param.linearRampToValueAtTime(1, now + shape.attackSeconds)
    else param.setValueAtTime(1, now)
    if (shape.decaySeconds > 0) {
      param.linearRampToValueAtTime(shape.sustain, now + shape.attackSeconds + shape.decaySeconds)
    } else {
      param.setValueAtTime(shape.sustain, now + shape.attackSeconds)
    }
    return { stage: 'attack', since: now, from }
  }

  const lift = (param: AudioParam, run: Running, shape: EnvelopeSettings, now: number): Running => {
    const from = levelAt(run, shape, now)
    param.cancelScheduledValues(now)
    param.setValueAtTime(from, now)
    param.linearRampToValueAtTime(0, now + Math.max(shape.releaseSeconds, 0.001))
    return { stage: 'release', since: now, from }
  }

  const glideTo = (live: Graph, target: number, now: number) => {
    const seconds = (settings?.glideSecondsPerOctave ?? 0) *
      (cents === null ? 0 : Math.abs(target - cents) / 1200)
    live.keyboard.offset.cancelScheduledValues(now)
    if (seconds > 0 && cents !== null) {
      live.keyboard.offset.setValueAtTime(cents, now)
      /* Linear in cents is exponential in hertz, which is what a slide between
         two notes sounds like. */
      live.keyboard.offset.linearRampToValueAtTime(target, now + seconds)
    } else {
      live.keyboard.offset.setValueAtTime(target, now)
    }
    cents = target
  }

  const wake = (): Graph | null => {
    if (!graph) {
      const context = open()
      graph = build(context)
      if (settings) applyTo(graph, settings)
    }
    /* Backgrounding a tab or an interruption on a phone suspends the context,
       and a note scheduled into a suspended context is never heard. */
    const resumable = graph.context as BaseAudioContext & { resume?: () => Promise<void> }
    if (graph.context.state === 'suspended') void resumable.resume?.()
    return graph
  }

  const noteOn = (key: number) => {
      if (held.includes(key)) return
      const before = held
      held = [...held, key]
      const live = wake()
      if (live) {
        const action = trigger(before, held)
        const now = live.context.currentTime
        const note = sounding(held)
        if (note !== null) glideTo(live, centsForKey(note), now)
        if (action === 'attack' && settings) {
          loudness = strike(live.vca.gain, loudness, settings.loudnessContour, now)
          filterRun = strike(live.contour.offset, filterRun, settings.filterContour, now)
        }
      }
      announce()
  }

  const noteOff = (key: number) => {
      if (!held.includes(key)) return
      const before = held
      held = held.filter((each) => each !== key)
      if (graph) {
        const action = trigger(before, held)
        const now = graph.context.currentTime
        const note = sounding(held)
        if (note !== null) glideTo(graph, centsForKey(note), now)
        if (action === 'release' && settings) {
          loudness = lift(graph.vca.gain, loudness, settings.loudnessContour, now)
          filterRun = lift(graph.contour.offset, filterRun, settings.filterContour, now)
        }
      }
      announce()
  }

  return {
    noteOn,
    noteOff,

    allOff() {
      for (const key of [...held]) noteOff(key)
    },

    apply(next) {
      settings = next
      /* Knobs turned before a note is ever played are not lost: the graph does
         not exist yet, and takes them the moment it does. */
      if (graph) applyTo(graph, next)
    },

    snapshot() {
      return state
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    close() {
      const live = graph
      graph = null
      applied = null
      held = []
      cents = null
      loudness = IDLE
      filterRun = IDLE
      const closable = live?.context as (BaseAudioContext & { close?: () => Promise<void> }) | undefined
      void closable?.close?.()
      announce()
    },
  }
}
