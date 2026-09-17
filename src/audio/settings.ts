/* The panel read as an instrument: every control turned into the quantity it
 * stands for, and nothing else.
 *
 * Pure, and total. Patches hold raw JSON, so nothing here may assume a value has
 * been through a codec; where a value is missing or the wrong shape the reading
 * falls to silent or neutral rather than to a guess, exactly as overload.ts
 * reads the same panel for the lamp.
 *
 * Panel only. A note is not in here, because pitch is a function of the panel
 * and a key, and because a description that changed on every key press could not
 * be diffed against the last one to find what a knob did.
 *
 * Every number it multiplies by comes from calibration.ts. Nothing in this file
 * invents a unit.
 */

import type { ControlValue } from '@controls/types.ts'
import { cal } from './calibration.ts'
import { WAVE_IDS, type WaveId } from './partials.ts'

type Values = Readonly<Record<string, ControlValue>>

const dial = (values: Values, id: string): number => {
  const raw = values[id]
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
}

const at = (values: Values, id: string, position: string): boolean => values[id] === position

const isOn = (values: Values, id: string): boolean => at(values, id, 'on')

/* A level knob heard as a curve rather than as a line, and switched out of the
   mixer where its source is off. */
const level = (values: Values, volume: string, source: string): number => {
  if (!isOn(values, source)) return 0
  const fraction = Math.min(1, Math.max(0, dial(values, volume) / 10))
  return fraction ** cal.volumeTaper
}

const RANGE_OCTAVES: Readonly<Record<string, number>> = {
  lo: cal.rangeLo,
  ft32: cal.range32,
  ft16: cal.range16,
  ft8: cal.range8,
  ft4: cal.range4,
  ft2: cal.range2,
}

const CENTS_PER_UNIT = cal.semitonesPerUnit * 100

export interface OscillatorSettings {
  readonly wave: WaveId
  /* Range, master tune and this oscillator's own frequency knob, summed. The
     note is not in here: it arrives as a voltage the three oscillators share. */
  readonly detuneCents: number
  readonly tracksKeyboard: boolean
  readonly level: number
}

export interface EnvelopeSettings {
  readonly attackSeconds: number
  readonly decaySeconds: number
  readonly sustain: number
  readonly releaseSeconds: number
}

export interface FilterSettings {
  readonly cutoffHz: number
  readonly q: number
  readonly keyboardTracking: number
  readonly contourCents: number
}

export interface ModulationSettings {
  readonly sourceA: 'osc3' | 'filterEg'
  readonly sourceB: 'noise' | 'lfo'
  /* 0 is all of A, 1 all of B. */
  readonly mix: number
  readonly lfoHz: number
  readonly toPitchCents: number
  readonly toCutoffCents: number
}

export interface Settings {
  readonly oscillators: readonly [OscillatorSettings, OscillatorSettings, OscillatorSettings]
  readonly noise: { readonly level: number; readonly pink: boolean }
  readonly filter: FilterSettings
  readonly filterContour: EnvelopeSettings
  readonly loudnessContour: EnvelopeSettings
  readonly bendCents: number
  readonly glideSecondsPerOctave: number
  readonly modulation: ModulationSettings
  readonly masterGain: number
  readonly a440: boolean
}

/* Controls that are real on the instrument and make no sound here, with the
   reason. Exported so a test can prove the silence rather than a comment
   claiming it. */
export const SILENT: Readonly<Record<string, string>> = {
  externalInputVolume: 'there is no jack to plug into',
  externalInputEnable: 'there is no jack to plug into',
  phonesVolume: 'a browser has one output, and Volume is already on it',
}

export function oscillatorSettings(values: Values, which: 1 | 2 | 3): OscillatorSettings {
  const raw = values[`osc${which}Waveform`]
  const wave = WAVE_IDS.includes(raw as WaveId) ? (raw as WaveId) : 'triangle'
  const octaves = RANGE_OCTAVES[String(values[`osc${which}Range`])] ?? cal.range8
  /* Oscillator-1 has no frequency knob on the panel, which is why it is the one
     the other two are tuned against. */
  const own = which === 1 ? 0 : dial(values, `osc${which}Frequency`)
  return {
    wave,
    detuneCents: octaves * 1200 + (dial(values, 'tune') + own) * CENTS_PER_UNIT,
    /* Only Oscillator-3 can be taken off the keyboard, which is what frees it to
       be a modulation source instead of a voice. */
    tracksKeyboard: which !== 3 || at(values, 'osc3Control', 'osc3'),
    level: level(values, `osc${which}Volume`, `osc${which}Enable`),
  }
}

export function filterSettings(values: Values): FilterSettings {
  const octaves = dial(values, 'cutoffFrequency') * cal.cutoffOctavesPerUnit
  const emphasis = Math.min(1, Math.max(0, dial(values, 'filterEmphasis') / 10))
  const steps = (isOn(values, 'keyboardControl1') ? 1 : 0) +
    (isOn(values, 'keyboardControl2') ? cal.trackingSecond : 0)
  return {
    /* Kept inside the audible band at both ends: past Nyquist a lowpass stops
       filtering, and below hearing it stops passing. */
    cutoffHz: Math.min(20000, Math.max(20, cal.cutoffAtZero * 2 ** octaves)),
    q: 0.7 + emphasis * (cal.emphasisQ - 0.7),
    keyboardTracking: steps * cal.trackingStep,
    contourCents: (Math.min(10, Math.max(0, dial(values, 'amountOfContour'))) / 10) *
      cal.contourOctaves * 1200,
  }
}

/* Attack and Decay are stored in milliseconds, so they are the one part of the
   instrument that needs no calibration at all.

   The Decay switch is what gives a note a release: with it off the sound stops
   when the key does, bar the few milliseconds that keep it from clicking. */
export function contourSettings(values: Values, which: 'filter' | 'loudness'): EnvelopeSettings {
  const decaySeconds = Math.max(0, dial(values, `${which}DecayTime`)) / 1000
  return {
    attackSeconds: Math.max(0, dial(values, `${which}AttackTime`)) / 1000,
    decaySeconds,
    sustain: Math.min(1, Math.max(0, dial(values, `${which}SustainLevel`) / 10)),
    releaseSeconds: isOn(values, 'decayEnable')
      ? Math.max(cal.releaseFloorMs / 1000, decaySeconds)
      : cal.releaseFloorMs / 1000,
  }
}

export function modulationSettings(values: Values): ModulationSettings {
  /* The wheel is the depth of the whole bus: at rest the instrument is not
     modulated at all, whatever the sources and the mix are set to. */
  const depth = Math.min(1, Math.max(0, dial(values, 'modWheel') / 10))
  const rate = Math.min(1, Math.max(0, dial(values, 'lfoRate') / 10))
  return {
    sourceA: at(values, 'modulationSourceA', 'filterEg') ? 'filterEg' : 'osc3',
    sourceB: at(values, 'modulationSourceB', 'lfo') ? 'lfo' : 'noise',
    mix: Math.min(1, Math.max(0, dial(values, 'modulationMix') / 10)),
    /* A rate knob is heard as a ratio, so the sweep is geometric. */
    lfoHz: cal.lfoLowHz * (cal.lfoHighHz / cal.lfoLowHz) ** rate,
    toPitchCents: isOn(values, 'oscillatorModulation') ? depth * cal.modulationCents : 0,
    toCutoffCents: isOn(values, 'filterModulation') ? depth * cal.modulationCutoffCents : 0,
  }
}

export function glideSecondsPerOctave(values: Values): number {
  if (!isOn(values, 'glideEnable')) return 0
  return (Math.min(10, Math.max(0, dial(values, 'glide'))) / 10) * cal.glideSecondsPerOctave
}

export function masterGain(values: Values): number {
  if (!isOn(values, 'mainOutput')) return 0
  const fraction = Math.min(1, Math.max(0, dial(values, 'mainVolume') / 10))
  /* Everything the mixer can sum at once, so four sources wide open reach full
     scale rather than overdriving. */
  return fraction ** cal.volumeTaper / cal.mixerHeadroom
}

export function settingsFrom(values: Values): Settings {
  return {
    oscillators: [
      oscillatorSettings(values, 1),
      oscillatorSettings(values, 2),
      oscillatorSettings(values, 3),
    ],
    noise: {
      level: level(values, 'noiseVolume', 'noiseEnable'),
      pink: at(values, 'noiseColour', 'pink'),
    },
    filter: filterSettings(values),
    filterContour: contourSettings(values, 'filter'),
    loudnessContour: contourSettings(values, 'loudness'),
    bendCents: dial(values, 'pitchWheel') * CENTS_PER_UNIT,
    glideSecondsPerOctave: glideSecondsPerOctave(values),
    modulation: modulationSettings(values),
    masterGain: masterGain(values),
    a440: isOn(values, 'a440'),
  }
}
