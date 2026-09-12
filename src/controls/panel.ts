import { placeholderType, type PlaceholderDef } from './placeholder.ts'
import { createRegistry } from './registry.ts'
import type { ControlType, GroupDef, SectionDef } from './types.ts'

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

export const controls: readonly PlaceholderDef[] = [
  // Controllers
  placeholder('tune', 'Tune', 'controllers', 'knob', { sheetScale: '−2 … 0 … 2' }),
  placeholder('oscillatorModulation', 'Oscillator Modulation', 'controllers', 'switch', {
    sheetScale: 'on',
  }),
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
  placeholder('osc3Control', 'Osc.3 Control', 'oscillatorBank', 'switch'),
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
  placeholder('overloadLamp', 'Overload', 'mixer', 'lamp', { group: 'mixExternal' }),
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

  // Output
  placeholder('mainVolume', 'Volume', 'output', 'knob', { sheetScale: '0 … 10' }),
  placeholder('mainOutput', 'Main Output', 'output', 'switch', { sheetScale: 'on' }),
  placeholder('a440', 'A-440', 'output', 'switch', { sheetScale: 'on' }),
  placeholder('phonesVolume', 'Phones Volume', 'output', 'knob', { sheetScale: '0 … 10' }),
  placeholder('phonesJack', 'Phones', 'output', 'jack'),

  // Power
  placeholder('powerLamp', 'Pilot Lamp', 'power', 'lamp'),
  placeholder('power', 'Power', 'power', 'switch', { sheetScale: 'on' }),

  // Performance (the bottom-left strip)
  placeholder('lfoRate', 'LFO Rate', 'performance', 'knob', { sheetScale: '0 … 10' }),
  placeholder('glideEnable', 'Glide', 'performance', 'switch', { sheetScale: 'on' }),
  placeholder('decayEnable', 'Decay', 'performance', 'switch', { sheetScale: 'on' }),
  placeholder('pitchWheel', 'Pitch', 'performance', 'wheel', { group: 'wheels' }),
  placeholder('modWheel', 'Mod.', 'performance', 'wheel', { group: 'wheels' }),
]

export const panelRegistry = createRegistry({ types: controlTypes, sections, groups, controls })
