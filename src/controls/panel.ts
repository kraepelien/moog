import { placeholderType, type PlaceholderDef } from './placeholder.ts'
import { createRegistry } from './registry.ts'
import type { ControlType, DecorationDef, GroupDef, PanelItem, SectionDef } from './types.ts'

/* Every control on the patch sheet, all of them placeholders. Nothing here says
   what a control's range, steps, positions or default are — those are specified
   one at a time, and replacing a placeholder is a change to `type` plus the
   type's own fields on this one entry.

   `sheetScale` is the printed scale copied off the sheet as a caption for review.
   It is not a range and nothing reads it as one.

   Control ids are permanent once a real value is saved under them. Nothing saves
   values through a placeholder, so every id here is still free to change. */

export const controlTypes: readonly ControlType<never, never>[] = [
  placeholderType as unknown as ControlType<never, never>,
]

export const sections: readonly SectionDef[] = [
  { id: 'controllers', label: 'Controllers' },
  { id: 'oscillatorBank', label: 'Oscillator Bank' },
  { id: 'mixer', label: 'Mixer' },
  { id: 'modifiers', label: 'Modifiers' },
  { id: 'output', label: 'Output' },
  { id: 'power', label: 'Power' },
  { id: 'performance', label: 'Performance' },
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

function placeholder(
  id: string,
  label: string,
  section: string,
  shape: PlaceholderDef['shape'],
  extra: { group?: string; sheetScale?: string } = {},
): PlaceholderDef {
  return { id, type: 'placeholder', label, section, shape, ...extra }
}

function decoration(
  id: string,
  label: string,
  section: string,
  shape: string,
  extra: { group?: string; note?: string } = {},
): DecorationDef {
  return { kind: 'decoration', id, label, section, shape, ...extra }
}

/* A real control on the instrument, but nothing a patch recalls. */
const NOT_A_SOUND = 'not part of a patch'

export const items: readonly PanelItem[] = [
  // Controllers
  placeholder('tune', 'Tune', 'controllers', 'knob', { sheetScale: '−2 … 0 … 2' }),
  placeholder('glide', 'Glide', 'controllers', 'knob', { sheetScale: '0 … 10' }),
  placeholder('modulationMix', 'Modulation Mix', 'controllers', 'knob', { sheetScale: '0 … 10' }),
  placeholder('modulationSourceA', 'Osc.3 / Filter EG', 'controllers', 'switch', {
    group: 'modSources',
    sheetScale: 'osc. 3 | filter eg',
  }),
  placeholder('modulationSourceB', 'Noise / LFO', 'controllers', 'switch', {
    group: 'modSources',
    sheetScale: 'noise | lfo',
  }),

  // Oscillator Bank
  placeholder('oscillatorModulation', 'Oscillator Modulation', 'oscillatorBank', 'switch', {
    sheetScale: 'on',
  }),
  placeholder('osc3Control', 'Osc.3 Control', 'oscillatorBank', 'switch'),
  /* Oscillator-1 has no frequency knob — confirmed against the instrument. The
     gap in the middle column is the hardware, not an omission. */
  placeholder('osc1Range', 'Range', 'oscillatorBank', 'selector', {
    group: 'osc1',
    sheetScale: "lo · 32' · 16' · 8' · 4' · 2'",
  }),
  placeholder('osc1Waveform', 'Waveform', 'oscillatorBank', 'selector', {
    group: 'osc1',
    sheetScale: 'six waveforms',
  }),
  placeholder('osc2Range', 'Range', 'oscillatorBank', 'selector', {
    group: 'osc2',
    sheetScale: "lo · 32' · 16' · 8' · 4' · 2'",
  }),
  placeholder('osc2Frequency', 'Frequency', 'oscillatorBank', 'knob', {
    group: 'osc2',
    sheetScale: '−7 … 0 … 7',
  }),
  placeholder('osc2Waveform', 'Waveform', 'oscillatorBank', 'selector', {
    group: 'osc2',
    sheetScale: 'six waveforms',
  }),
  placeholder('osc3Range', 'Range', 'oscillatorBank', 'selector', {
    group: 'osc3',
    sheetScale: "lo · 32' · 16' · 8' · 4' · 2'",
  }),
  placeholder('osc3Frequency', 'Frequency', 'oscillatorBank', 'knob', {
    group: 'osc3',
    sheetScale: '−7 … 0 … 7',
  }),
  placeholder('osc3Waveform', 'Waveform', 'oscillatorBank', 'selector', {
    group: 'osc3',
    sheetScale: 'six waveforms',
  }),

  // Mixer
  placeholder('osc1Volume', 'Osc.1 Volume', 'mixer', 'knob', {
    group: 'mixOsc1',
    sheetScale: '0 … 10',
  }),
  placeholder('osc1Enable', 'Osc.1', 'mixer', 'switch', { group: 'mixOsc1', sheetScale: 'on' }),
  placeholder('osc2Volume', 'Osc.2 Volume', 'mixer', 'knob', {
    group: 'mixOsc2',
    sheetScale: '0 … 10',
  }),
  placeholder('osc2Enable', 'Osc.2', 'mixer', 'switch', { group: 'mixOsc2', sheetScale: 'on' }),
  placeholder('osc3Volume', 'Osc.3 Volume', 'mixer', 'knob', {
    group: 'mixOsc3',
    sheetScale: '0 … 10',
  }),
  placeholder('osc3Enable', 'Osc.3', 'mixer', 'switch', { group: 'mixOsc3', sheetScale: 'on' }),
  placeholder('externalInputVolume', 'External Input Volume', 'mixer', 'knob', {
    group: 'mixExternal',
    sheetScale: '0 … 10',
  }),
  placeholder('externalInputEnable', 'External Input', 'mixer', 'switch', {
    group: 'mixExternal',
    sheetScale: 'on',
  }),
  decoration('overloadLamp', 'Overload', 'mixer', 'lamp', {
    group: 'mixExternal',
    note: 'reflects the external input level; nothing to set',
  }),
  placeholder('noiseVolume', 'Noise Volume', 'mixer', 'knob', {
    group: 'mixNoise',
    sheetScale: '0 … 10',
  }),
  placeholder('noiseEnable', 'Noise', 'mixer', 'switch', { group: 'mixNoise', sheetScale: 'on' }),
  placeholder('noiseColour', 'Noise Colour', 'mixer', 'switch', {
    group: 'mixNoise',
    sheetScale: 'white | pink',
  }),

  // Modifiers
  placeholder('filterModulation', 'Filter Modulation', 'modifiers', 'switch', {
    group: 'filterRouting',
    sheetScale: 'on',
  }),
  placeholder('keyboardControl1', 'Keyboard Control 1', 'modifiers', 'switch', {
    group: 'filterRouting',
    sheetScale: 'on',
  }),
  placeholder('keyboardControl2', 'Keyboard Control 2', 'modifiers', 'switch', {
    group: 'filterRouting',
    sheetScale: 'on',
  }),
  placeholder('cutoffFrequency', 'Cutoff Frequency', 'modifiers', 'knob', {
    group: 'filter',
    sheetScale: '−4 … 0 … 4',
  }),
  placeholder('filterEmphasis', 'Filter Emphasis', 'modifiers', 'knob', {
    group: 'filter',
    sheetScale: '0 … 10',
  }),
  placeholder('amountOfContour', 'Amount of Contour', 'modifiers', 'knob', {
    group: 'filter',
    sheetScale: '0 … 10',
  }),
  placeholder('filterAttackTime', 'Attack Time', 'modifiers', 'knob', {
    group: 'filterContour',
    sheetScale: '10 msec … 10 sec',
  }),
  placeholder('filterDecayTime', 'Decay Time', 'modifiers', 'knob', {
    group: 'filterContour',
    sheetScale: '10 msec … 10 sec',
  }),
  placeholder('filterSustainLevel', 'Sustain Level', 'modifiers', 'knob', {
    group: 'filterContour',
    sheetScale: '0 … 10',
  }),
  placeholder('loudnessAttackTime', 'Attack Time', 'modifiers', 'knob', {
    group: 'loudnessContour',
    sheetScale: '10 msec … 10 sec',
  }),
  placeholder('loudnessDecayTime', 'Decay Time', 'modifiers', 'knob', {
    group: 'loudnessContour',
    sheetScale: '10 msec … 10 sec',
  }),
  placeholder('loudnessSustainLevel', 'Sustain Level', 'modifiers', 'knob', {
    group: 'loudnessContour',
    sheetScale: '0 … 10',
  }),

  /* Output and Power are drawn but hold nothing. Level, headphone level, main
     output, A-440 and mains power are all real controls on the instrument that a
     patch has no business recalling. */
  decoration('mainVolume', 'Volume', 'output', 'knob', { note: NOT_A_SOUND }),
  decoration('mainOutput', 'Main Output', 'output', 'switch', { note: NOT_A_SOUND }),
  decoration('a440', 'A-440', 'output', 'switch', { note: 'tuning reference' }),
  decoration('phonesVolume', 'Phones Volume', 'output', 'knob', { note: NOT_A_SOUND }),
  decoration('phonesJack', 'Phones', 'output', 'jack', { note: 'a socket' }),

  decoration('powerLamp', 'Pilot Lamp', 'power', 'lamp', { note: 'indicator' }),
  decoration('power', 'Power', 'power', 'switch', { note: NOT_A_SOUND }),

  // Performance (the bottom-left strip)
  placeholder('lfoRate', 'LFO Rate', 'performance', 'knob', { sheetScale: '0 … 10' }),
  placeholder('glideEnable', 'Glide', 'performance', 'switch', { sheetScale: 'on' }),
  placeholder('decayEnable', 'Decay', 'performance', 'switch', { sheetScale: 'on' }),
  placeholder('pitchWheel', 'Pitch', 'performance', 'wheel', { group: 'wheels' }),
  placeholder('modWheel', 'Mod.', 'performance', 'wheel', { group: 'wheels' }),
]

export const panelRegistry = createRegistry({ types: controlTypes, sections, groups, items })
