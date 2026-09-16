/* Where things sit, kept apart from what things are.
 *
 * The registry says a control belongs to Oscillator Bank; this says it sits in
 * the second column of the third row. Splitting them keeps the rule that adding
 * a knob to a section needs no layout edit: a control with no position here is
 * still drawn, it just flows after the placed ones instead of landing somewhere
 * chosen.
 *
 * A row is a line of `grid-template-areas`, and the area names are control ids,
 * which works because every id is already a valid CSS identifier — letters,
 * digits, dashes and underscores, never leading with a digit. A `.` is an empty
 * cell, and repeating an id spans it.
 */

/* The sheet prints these across the page in this order. */
export const PANEL_ROW: readonly string[] = [
  'controllers',
  'oscillatorBank',
  'mixer',
  'modifiers',
  'output',
  'power',
]

/* And these underneath, beside the notes. */
export const BELOW_PANEL: readonly string[] = ['performance']

export const SECTION_GRIDS: Readonly<Record<string, readonly string[]>> = {
  controllers: [
    'tune              tune',
    'glide             modulationMix',
    'modulationSourceA modulationSourceB',
  ],

  /* The gap in the first row is Oscillator-1 having no frequency knob. Left
     empty rather than closed up, so the column still reads as a column and the
     absence looks deliberate — which it is. */
  oscillatorBank: [
    'oscillatorModulation osc1Range .             osc1Waveform',
    'osc3Control          osc2Range osc2Frequency osc2Waveform',
    '.                    osc3Range osc3Frequency osc3Waveform',
  ],

  /* All five source switches share one column on the instrument, running down
     past the three volume knobs — they are not paired beside the thing each one
     enables, which is how the registry groups them. */
  mixer: [
    'osc1Volume osc1Enable          externalInputVolume overloadLamp',
    'osc2Volume osc2Enable          noiseVolume         noiseColour',
    'osc3Volume osc3Enable          .                   .',
    '.          externalInputEnable .                   .',
    '.          noiseEnable         .                   .',
  ],

  modifiers: [
    'filterModulation cutoffFrequency    filterEmphasis    amountOfContour',
    'keyboardControl1 filterAttackTime   filterDecayTime   filterSustainLevel',
    'keyboardControl2 loudnessAttackTime loudnessDecayTime loudnessSustainLevel',
  ],

  output: [
    'mainVolume   mainOutput',
    '.            a440',
    'phonesVolume phonesJack',
  ],

  power: ['powerLamp', 'power'],

  /* LFO Rate spans both switch rows, which is how the strip is printed. */
  performance: [
    'lfoRate    glideEnable',
    'lfoRate    decayEnable',
    'pitchWheel modWheel',
  ],
}

export function gridFor(sectionId: string): readonly string[] | undefined {
  return SECTION_GRIDS[sectionId]
}

/* Every id the grid places, so the renderer can tell a positioned control from
   one that has to flow. */
export function placedIn(sectionId: string): ReadonlySet<string> {
  const grid = SECTION_GRIDS[sectionId]
  if (!grid) return new Set()
  const names = new Set<string>()
  for (const row of grid) {
    for (const cell of row.trim().split(/\s+/)) {
      if (cell !== '.') names.add(cell)
    }
  }
  return names
}

/* `grid-template-areas` wants each row quoted. */
export function templateAreas(grid: readonly string[]): string {
  return grid.map((row) => `"${row.trim().replace(/\s+/g, ' ')}"`).join(' ')
}
