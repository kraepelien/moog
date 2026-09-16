import { placeholderType } from './placeholder.ts'
import { createRegistry } from './registry.ts'
import { continuousKnobType, type ContinuousKnobDef } from './continuousKnob.ts'
import { stepKnobType, type StepKnobDef, type StepPosition } from './stepKnob.ts'
import { timeKnobType, type TimeKnobDef } from './timeKnob.ts'
import { toggleSwitchType, type CapColour, type ToggleSwitchDef } from './toggleSwitch.ts'
import { wheelType, type WheelDef } from './wheel.ts'
import type { ControlType, DecorationDef, GroupDef, PanelItem, SectionDef } from './types.ts'

/* Every control on the patch sheet. All of them are now specified; the
   placeholder type stays registered so the next control added to the instrument
   can be laid out before it is specified, which is how each of these arrived.

   Control ids and position ids are permanent: they are what a saved patch
   contains, so renaming one breaks existing data. */

export const controlTypes: readonly ControlType<never, never>[] = [
  placeholderType as unknown as ControlType<never, never>,
  stepKnobType as unknown as ControlType<never, never>,
  toggleSwitchType as unknown as ControlType<never, never>,
  continuousKnobType as unknown as ControlType<never, never>,
  timeKnobType as unknown as ControlType<never, never>,
  wheelType as unknown as ControlType<never, never>,
]

/* The six rotary-selector positions, counter-clockwise end first, matching the
   order of the detents on the artwork.

   Position ids are as permanent as control ids — they are what a patch stores —
   so they are deliberately not the printed labels (re-typesetting 8' would break
   every saved patch) and not indices (inserting a position would shift them). The
   octave ids carry an "ft" prefix rather than being bare numbers because a
   JavaScript object hoists and reorders integer-like keys, which would quietly
   scramble the order of anything later keyed by position id. */
const RANGE_POSITIONS = [
  { id: 'lo', label: 'LO', cap: 'LO' },
  { id: 'ft32', label: "32'", cap: "32'" },
  { id: 'ft16', label: "16'", cap: "16'" },
  { id: 'ft8', label: "8'", cap: "8'" },
  { id: 'ft4', label: "4'", cap: "4'" },
  { id: 'ft2', label: "2'", cap: "2'" },
] as const

/* The oscillators differ at the second detent and nowhere else: Oscillator-3
   has a reverse sawtooth there, Oscillator-1 and 2 a triangle-sawtooth hybrid.
   Two lists rather than one shared one, because that difference is real. */
const OSC12_WAVEFORM_POSITIONS = [
  { id: 'triangle', label: 'Triangle', glyph: 'triangle' },
  { id: 'triangleSaw', label: 'Triangle-saw', glyph: 'triangleSaw' },
  { id: 'sawtooth', label: 'Sawtooth', glyph: 'sawtooth' },
  { id: 'square', label: 'Square', glyph: 'square' },
  { id: 'widePulse', label: 'Wide pulse', glyph: 'widePulse' },
  { id: 'narrowPulse', label: 'Narrow pulse', glyph: 'narrowPulse' },
] as const

const OSC3_WAVEFORM_POSITIONS = [
  { id: 'triangle', label: 'Triangle', glyph: 'triangle' },
  { id: 'reverseSawtooth', label: 'Reverse sawtooth', glyph: 'reverseSawtooth' },
  { id: 'sawtooth', label: 'Sawtooth', glyph: 'sawtooth' },
  { id: 'square', label: 'Square', glyph: 'square' },
  { id: 'widePulse', label: 'Wide pulse', glyph: 'widePulse' },
  { id: 'narrowPulse', label: 'Narrow pulse', glyph: 'narrowPulse' },
] as const

/* Every continuous control stores to a hundredth and prints a tenth. Nothing on
   the panel steps in whole units — the controls with set values are the rotary
   selectors and the switches, and those are discrete types, not knobs with a
   step of 1. */
const KNOB_STEP = 0.01
const KNOB_DECIMALS = 1

export const sections: readonly SectionDef[] = [
  { id: 'controllers', label: 'Controllers' },
  { id: 'oscillatorBank', label: 'Oscillator Bank' },
  { id: 'mixer', label: 'Mixer' },
  { id: 'modifiers', label: 'Modifiers' },
  { id: 'output', label: 'Output' },
  { id: 'power', label: 'Power' },
  { id: 'performance', label: 'Performance' },
  /* Unnamed: the instrument prints a section name under every part of the panel
     except this one. */
  { id: 'keyboard', label: '' },
]

export const groups: readonly GroupDef[] = [
  { id: 'modSources', label: '', section: 'controllers' },
  { id: 'osc1', label: 'Oscillator-1', section: 'oscillatorBank' },
  { id: 'osc2', label: 'Oscillator-2', section: 'oscillatorBank' },
  { id: 'osc3', label: 'Oscillator-3', section: 'oscillatorBank' },
  { id: 'mixOsc1', label: '', section: 'mixer' },
  { id: 'mixOsc2', label: '', section: 'mixer' },
  { id: 'mixOsc3', label: '', section: 'mixer' },
  { id: 'mixExternal', label: '', section: 'mixer' },
  { id: 'mixNoise', label: '', section: 'mixer' },
  { id: 'filterRouting', label: '', section: 'modifiers' },
  { id: 'filter', label: 'Filter', section: 'modifiers' },
  { id: 'filterContour', label: 'Filter Contour', section: 'modifiers' },
  { id: 'loudnessContour', label: 'Loudness Contour', section: 'modifiers' },
  { id: 'wheels', label: '', section: 'performance' },
]

function stepKnob(
  id: string,
  label: string,
  section: string,
  positions: readonly StepPosition[],
  defaultPosition: string,
  extra: { group?: string } = {},
): StepKnobDef {
  return { id, type: 'stepKnob', label, section, positions, default: defaultPosition, ...extra }
}

/* An on/off rocker prints its legend on one side only, which is why the off
   position carries an empty label rather than the word OFF.

   These start on. A patch sheet is a record of a sound that was making noise,
   so a blank one is a better starting point with everything routed than with
   every path switched out. */
function onOff(
  id: string,
  label: string,
  section: string,
  extra: {
    group?: string
    headline?: string
    default?: 'on' | 'off'
    cap?: CapColour
    recalled?: boolean
  } = {},
): ToggleSwitchDef {
  return {
    id,
    type: 'toggleSwitch',
    label,
    section,
    positions: [
      { id: 'off', label: '' },
      { id: 'on', label: 'ON' },
    ],
    default: extra.default ?? 'on',
    ...(extra.group ? { group: extra.group } : {}),
    ...(extra.headline ? { headline: extra.headline } : {}),
    ...(extra.cap ? { cap: extra.cap } : {}),
    ...(extra.recalled === false ? { recalled: false } : {}),
  }
}

/* A rocker choosing between two named things rather than turning one on. */
function chooser(
  id: string,
  label: string,
  section: string,
  a: { id: string; label: string },
  b: { id: string; label: string },
  extra: {
    group?: string
    headline?: string
    default?: string
    orientation?: 'horizontal' | 'vertical'
    cap?: CapColour
  } = {},
): ToggleSwitchDef {
  return {
    id,
    type: 'toggleSwitch',
    label,
    section,
    positions: [a, b],
    default: extra.default ?? a.id,
    ...(extra.group ? { group: extra.group } : {}),
    ...(extra.headline ? { headline: extra.headline } : {}),
    ...(extra.orientation ? { orientation: extra.orientation } : {}),
    ...(extra.cap ? { cap: extra.cap } : {}),
  }
}

/* The 0-10 knobs: one tick per unit, a numeral every other tick. Stored to a
   hundredth but shown to a tenth, so a value set by dragging keeps the precision
   it was given while the panel stays readable. */
function knob0to10(
  id: string,
  label: string,
  section: string,
  defaultValue: number,
  extra: { group?: string; size?: 'small' | 'large'; recalled?: boolean } = {},
): ContinuousKnobDef {
  return {
    id,
    type: 'continuousKnob',
    label,
    section,
    min: 0,
    max: 10,
    default: defaultValue,
    step: KNOB_STEP,
    decimals: KNOB_DECIMALS,
    scale: { tickStep: 1, labelStep: 2 },
    ...extra,
  }
}

/* The symmetric knobs, where 0 sits at the top of the sweep. On every one of
   these the silkscreen stops short of where the knob actually travels, so the
   printed scale is given separately from the range. */
function knobSymmetric(
  id: string,
  label: string,
  section: string,
  range: number,
  printed: number,
  scale: { tickStep: number; labelStep: number },
  extra: { group?: string; size?: 'small' | 'large'; step?: number } = {},
): ContinuousKnobDef {
  const { step = KNOB_STEP, ...rest } = extra
  return {
    id,
    type: 'continuousKnob',
    label,
    section,
    min: -range,
    max: range,
    default: 0,
    step,
    decimals: KNOB_DECIMALS,
    scale: { from: -printed, to: printed, ...scale },
    ...rest,
  }
}

/* The attack and decay marks, in milliseconds. Evenly spaced around the dial
   while their values are not — the first half of the turn covers 0 to 800 ms,
   the second 1 to 30 seconds. That even spacing is what puts 800 ms at exactly
   half travel, which is how the knob was described to us.

   Reported second-hand and described as approximate; see
   reference/control-values.md. Attack and Decay appear to differ slightly
   despite identical markings, so each control carries its own table and the two
   can diverge without touching anything else. */
const CONTOUR_TIME_MS = [
  0, 10, 100, 200, 400, 600, 800, 1_000, 3_000, 5_000, 7_500, 10_000, 30_000,
] as const

function timeKnob(
  id: string,
  label: string,
  section: string,
  extra: { group?: string; default?: number } = {},
): TimeKnobDef {
  return {
    id,
    type: 'timeKnob',
    label,
    section,
    anchors: CONTOUR_TIME_MS,
    default: extra.default ?? 0,
    ...(extra.group ? { group: extra.group } : {}),
  }
}

/* The two performance wheels. Neither carries printed numerals, so the ranges
   here are a convention rather than something read off the panel: Mod runs 0 to
   10 like every other level on the instrument, Pitch is symmetric about a centre
   it springs back to. */
function wheel(
  id: string,
  label: string,
  section: string,
  range: { min: number; max: number; default: number; springsTo?: number },
  extra: { group?: string } = {},
): WheelDef {
  return {
    id,
    type: 'wheel',
    label,
    section,
    step: KNOB_STEP,
    decimals: KNOB_DECIMALS,
    ...range,
    ...(extra.group ? { group: extra.group } : {}),
  }
}

function decoration(
  id: string,
  label: string,
  section: string,
  shape: string,
  extra: { group?: string; note?: string; cap?: string } = {},
): DecorationDef {
  return { kind: 'decoration', id, label, section, shape, ...extra }
}

/* A real control on the instrument, but nothing a patch recalls. */
const NOT_A_SOUND = 'not part of a patch'

export const items: readonly PanelItem[] = [
  // Controllers
  knobSymmetric('tune', 'Tune', 'controllers', 2.5, 2, { tickStep: 0.5, labelStep: 1 }, {
    size: 'large',
  }),
  knob0to10('glide', 'Glide', 'controllers', 0, { size: 'large' }),
  /* A level like any other, but its ends name what it mixes between rather than
     counting, so 0 and 10 are printed as sources instead of as numbers. */
  {
    ...knob0to10('modulationMix', 'Modulation Mix', 'controllers', 0, { size: 'large' }),
    scale: {
      tickStep: 1,
      labelStep: 2,
      labels: {
        0: ['Osc. 3 /', 'Filter EG'],
        10: ['Noise /', 'LFO'],
      },
    },
  },
  chooser(
    'modulationSourceA',
    'Osc.3 / Filter EG',
    'controllers',
    { id: 'osc3', label: 'Osc. 3' },
    { id: 'filterEg', label: 'Filter EG' },
    { group: 'modSources', cap: 'black' },
  ),
  chooser(
    'modulationSourceB',
    'Noise / LFO',
    'controllers',
    { id: 'noise', label: 'Noise' },
    { id: 'lfo', label: 'LFO' },
    { group: 'modSources', cap: 'black' },
  ),

  // Oscillator Bank
  onOff('oscillatorModulation', 'Oscillator Modulation', 'oscillatorBank', {
    headline: 'Oscillator Modulation',
  }),
  chooser(
    'osc3Control',
    'Osc.3 Control',
    'oscillatorBank',
    { id: 'osc3', label: 'Osc. 3' },
    { id: 'lo', label: 'LO' },
    { headline: 'Osc. 3 Control' },
  ),
  /* Oscillator-1 has no frequency knob — confirmed against the instrument. The
     gap in the middle column is the hardware, not an omission. */
  stepKnob('osc1Range', 'Range', 'oscillatorBank', RANGE_POSITIONS, 'ft8', { group: 'osc1' }),
  stepKnob('osc1Waveform', 'Waveform', 'oscillatorBank', OSC12_WAVEFORM_POSITIONS, 'triangle', {
    group: 'osc1',
  }),
  stepKnob('osc2Range', 'Range', 'oscillatorBank', RANGE_POSITIONS, 'ft8', { group: 'osc2' }),
  knobSymmetric('osc2Frequency', 'Frequency', 'oscillatorBank', 8, 7, { tickStep: 1, labelStep: 2 }, {
    group: 'osc2',
    size: 'large',
  }),
  stepKnob('osc2Waveform', 'Waveform', 'oscillatorBank', OSC12_WAVEFORM_POSITIONS, 'triangle', {
    group: 'osc2',
  }),
  stepKnob('osc3Range', 'Range', 'oscillatorBank', RANGE_POSITIONS, 'ft8', { group: 'osc3' }),
  knobSymmetric('osc3Frequency', 'Frequency', 'oscillatorBank', 8, 7, { tickStep: 1, labelStep: 2 }, {
    group: 'osc3',
    size: 'large',
  }),
  stepKnob('osc3Waveform', 'Waveform', 'oscillatorBank', OSC3_WAVEFORM_POSITIONS, 'triangle', {
    group: 'osc3',
  }),

  // Mixer
  knob0to10('osc1Volume', 'Osc.1 Volume', 'mixer', 0, { group: 'mixOsc1' }),
  onOff('osc1Enable', 'Osc.1', 'mixer', { group: 'mixOsc1', cap: 'blue' }),
  knob0to10('osc2Volume', 'Osc.2 Volume', 'mixer', 0, { group: 'mixOsc2' }),
  onOff('osc2Enable', 'Osc.2', 'mixer', { group: 'mixOsc2', cap: 'blue' }),
  knob0to10('osc3Volume', 'Osc.3 Volume', 'mixer', 0, { group: 'mixOsc3' }),
  onOff('osc3Enable', 'Osc.3', 'mixer', { group: 'mixOsc3', cap: 'blue' }),
  knob0to10('externalInputVolume', 'External Input Volume', 'mixer', 0, { group: 'mixExternal' }),
  onOff('externalInputEnable', 'External Input', 'mixer', { group: 'mixExternal', cap: 'blue' }),
  decoration('overloadLamp', 'Overload', 'mixer', 'lamp', {
    group: 'mixExternal',
    note: 'reflects the external input level; nothing to set',
  }),
  knob0to10('noiseVolume', 'Noise Volume', 'mixer', 0, { group: 'mixNoise' }),
  onOff('noiseEnable', 'Noise', 'mixer', { group: 'mixNoise', cap: 'blue' }),
  chooser(
    'noiseColour',
    'Noise Colour',
    'mixer',
    { id: 'white', label: 'White' },
    { id: 'pink', label: 'Pink' },
    { group: 'mixNoise', orientation: 'vertical', cap: 'blue' },
  ),

  // Modifiers
  onOff('filterModulation', 'Filter Modulation', 'modifiers', {
    group: 'filterRouting',
    headline: 'Filter Modulation',
  }),
  onOff('keyboardControl1', 'Keyboard Control 1', 'modifiers', {
    group: 'filterRouting',
    headline: 'Keyboard Control 1',
  }),
  onOff('keyboardControl2', 'Keyboard Control 2', 'modifiers', {
    group: 'filterRouting',
    headline: 'Keyboard Control 2',
  }),
  knobSymmetric('cutoffFrequency', 'Cutoff Frequency', 'modifiers', 5, 4, { tickStep: 1, labelStep: 2 }, {
    group: 'filter',
    size: 'large',
  }),
  knob0to10('filterEmphasis', 'Filter Emphasis', 'modifiers', 0, { group: 'filter' }),
  knob0to10('amountOfContour', 'Amount of Contour', 'modifiers', 0, { group: 'filter' }),
  timeKnob('filterAttackTime', 'Attack Time', 'modifiers', { group: 'filterContour' }),
  timeKnob('filterDecayTime', 'Decay Time', 'modifiers', { group: 'filterContour' }),
  knob0to10('filterSustainLevel', 'Sustain Level', 'modifiers', 0, { group: 'filterContour' }),
  timeKnob('loudnessAttackTime', 'Attack Time', 'modifiers', { group: 'loudnessContour' }),
  timeKnob('loudnessDecayTime', 'Decay Time', 'modifiers', { group: 'loudnessContour' }),
  knob0to10('loudnessSustainLevel', 'Sustain Level', 'modifiers', 0, { group: 'loudnessContour' }),

  /* Output and Power are drawn but hold nothing. Level, headphone level, main
     output, A-440 and mains power are all real controls on the instrument that a
     patch has no business recalling. */
  /* Output is real: the knobs turn and the switches throw. None of it is
     recalled — a patch that reset the monitoring level would be setting the
     volume of the room it is played in. A-440 is off, because it is a tuning
     tone you switch on and then off again. */
  knob0to10('mainVolume', 'Volume', 'output', 5, { recalled: false }),
  onOff('mainOutput', 'Main Output', 'output', {
    headline: 'Main Output',
    default: 'on',
    cap: 'blue',
    recalled: false,
  }),
  onOff('a440', 'A-440', 'output', {
    headline: 'A-440',
    default: 'off',
    cap: 'blue',
    recalled: false,
  }),
  knob0to10('phonesVolume', 'Phones Volume', 'output', 5, { recalled: false }),
  decoration('phonesJack', 'Phones', 'output', 'jack', { note: 'a socket' }),

  decoration('powerLamp', 'Pilot Lamp', 'power', 'lamp', { note: 'indicator', cap: 'red' }),
  decoration('power', 'Power', 'power', 'switch', { note: NOT_A_SOUND, cap: 'black' }),

  // Performance (the bottom-left strip)
  knob0to10('lfoRate', 'LFO Rate', 'performance', 0),
  onOff('glideEnable', 'Glide', 'performance', { headline: 'Glide', cap: 'white' }),
  onOff('decayEnable', 'Decay', 'performance', { headline: 'Decay', cap: 'white' }),
  wheel('pitchWheel', 'Pitch', 'performance', { min: -5, max: 5, default: 0, springsTo: 0 }, {
    group: 'wheels',
  }),
  wheel('modWheel', 'Mod.', 'performance', { min: 0, max: 10, default: 0 }, { group: 'wheels' }),

  /* One item rather than forty-four: a patch holds nothing a key would set, so
     the keyboard is on the panel as a shape. What it sounds comes from the rest
     of the panel, which is why it needs no value of its own. */
  decoration('keyboard', 'Keyboard', 'keyboard', 'keyboard', { note: '44 keys, F to C' }),
]

export const panelRegistry = createRegistry({ types: controlTypes, sections, groups, items })
