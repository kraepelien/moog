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
 * cell, and repeating an id spans it. Names that are not control ids are
 * headings, declared below.
 */

export interface SectionLayout {
  readonly rows: readonly string[]
  /* Cells that print a word rather than holding a control, one entry per line,
     because several of them are set on two lines on the panel. */
  readonly headings?: Readonly<Record<string, readonly string[]>>
  /* What a control prints above itself, when the panel does not use the name the
     registry gives it. An empty string prints nothing, which is what a column
     already headed needs — the instrument labels the column, not each knob in
     it. The registry's label is still what a screen reader hears. */
  readonly labels?: Readonly<Record<string, string>>
  /* Set where the section's rows alternate between columns, so that the cell
     beside a knob's neighbour is empty and the knob can stand taller than the
     row it is in. The switches then set the pitch, which is how the panel
     stacks the mixer: sized by the knobs instead, the column runs a knob and a
     caption taller per row than the instrument does. */
  readonly knobsOverlapRows?: boolean
}

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

const SECTIONS: Readonly<Record<string, SectionLayout>> = {
  controllers: {
    rows: [
      'tune              tune',
      'glide             modulationMix',
      'modulationSourceA modulationSourceB',
    ],
  },

  /* Range and Waveform are headed once across the top, as on the panel, so the
     six knobs beneath them print nothing of their own. The middle column heads
     Oscillator-1 — which has no frequency knob, hence the gap — and the other
     two frequency knobs carry their oscillator's name, which is how the panel
     names those rows. */
  oscillatorBank: {
    rows: [
      '.                    hdrRange  hdrOsc1       hdrWave',
      'oscillatorModulation osc1Range .             osc1Waveform',
      'osc3Control          osc2Range osc2Frequency osc2Waveform',
      '.                    osc3Range osc3Frequency osc3Waveform',
    ],
    headings: {
      hdrRange: ['Range'],
      hdrOsc1: ['Oscillator-1', 'Frequency'],
      hdrWave: ['Waveform'],
    },
    labels: {
      osc1Range: '',
      osc2Range: '',
      osc3Range: '',
      osc1Waveform: '',
      osc2Waveform: '',
      osc3Waveform: '',
      osc2Frequency: 'Oscillator-2',
      osc3Frequency: 'Oscillator-3',
    },
  },

  /* The five source switches are one column, and each sits level with the knob
     it enables — which alternates between the oscillator volumes on the left and
     the external and noise knobs on the right, rather than running down one side
     and then the other. Every knob has its switch beside it; the column is
     shared, not the pairing. */
  mixer: {
    knobsOverlapRows: true,
    rows: [
      'osc1Volume osc1Enable          .                   .',
      '.          externalInputEnable externalInputVolume overloadLamp',
      'osc2Volume osc2Enable          .                   .',
      '.          noiseEnable         noiseVolume         noiseColour',
      'osc3Volume osc3Enable          .                   .',
    ],
    /* Only the top knob is headed: the switch beside each of the others already
       says which oscillator it belongs to. */
    labels: {
      osc1Volume: 'Volume',
      osc2Volume: '',
      osc3Volume: '',
    },
  },

  /* Two contours with identical markings, told apart by the heading over the
     second — which is exactly why a control needed a group as well as a
     section. Filter heads the first block the same way. */
  modifiers: {
    rows: [
      '.                hdrFilter          hdrFilter         hdrFilter',
      'filterModulation cutoffFrequency    filterEmphasis    amountOfContour',
      'keyboardControl1 filterAttackTime   filterDecayTime   filterSustainLevel',
      '.                hdrLoudness        hdrLoudness       hdrLoudness',
      'keyboardControl2 loudnessAttackTime loudnessDecayTime loudnessSustainLevel',
    ],
    headings: {
      hdrFilter: ['Filter'],
      hdrLoudness: ['Loudness Contour'],
    },
  },

  output: {
    rows: ['mainVolume mainOutput', '. a440', 'phonesVolume phonesJack'],
  },

  power: { rows: ['powerLamp', 'power'] },

  /* LFO Rate spans both switch rows, which is how the strip is printed. */
  performance: {
    rows: ['lfoRate glideEnable', 'lfoRate decayEnable', 'pitchWheel modWheel'],
  },
}

export function layoutFor(sectionId: string): SectionLayout | undefined {
  return SECTIONS[sectionId]
}

/* Every name the grid places, headings included, so the renderer can tell a
   positioned control from one that has to flow. */
export function placedIn(sectionId: string): ReadonlySet<string> {
  const layout = SECTIONS[sectionId]
  if (!layout) return new Set()
  const names = new Set<string>()
  for (const row of layout.rows) {
    for (const cell of row.trim().split(/\s+/)) {
      if (cell !== '.') names.add(cell)
    }
  }
  return names
}

/* Each layout row becomes two grid rows: the captions, then the controls. A
   caption drawn by the section rather than by the control keeps it out of the
   control's own box, so a two-line caption no longer pushes its knob down past
   the switch beside it — every body in a row centres on one line whatever is
   printed above it.
 *
 * A cell repeated from the row above is a control spanning rows, and its area
 * has to stay one rectangle, so the span continues through the caption row
 * instead of being broken by it.
 */
export function withCaptionRows(rows: readonly string[]): string[] {
  const grid = rows.map((row) => row.trim().split(/\s+/))
  const out: string[] = []
  grid.forEach((cells, index) => {
    const above = grid[index - 1]
    const captions = cells.map((cell, column) => {
      if (cell === '.') return '.'
      return above?.[column] === cell ? cell : `${cell}-cap`
    })
    out.push(captions.join(' '), cells.join(' '))
  })
  return out
}

/* Each column takes the width of its own widest control. Even columns would put
   a switch's column — five knobs wide on the sheet, a third of one here — on the
   same footing as the frequency knobs beside it, and the panel is scaled to the
   window, so every idle column is taken off the size of every knob on it. What
   an even column was for is captions, and those no longer set a column's width;
   see .caption. */
export function columnCount(rows: readonly string[]): number {
  return Math.max(...rows.map((row) => row.trim().split(/\s+/).length))
}

/* `grid-template-areas` wants each row quoted. */
export function templateAreas(rows: readonly string[]): string {
  return rows.map((row) => `"${row.trim().replace(/\s+/g, ' ')}"`).join(' ')
}
