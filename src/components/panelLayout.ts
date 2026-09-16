/* Where things sit, kept apart from what things are, so that adding a knob
   needs no layout edit: one with no position here still draws, it just flows
   after the placed ones.

   A row is a line of `grid-template-areas` whose area names are control ids,
   which works because an id is already a valid CSS identifier. `.` is empty,
   a repeated id spans, and a name that is not a control id is a heading. */

export interface SectionLayout {
  readonly rows: readonly string[]
  /* One entry per line, because several are set on two lines on the panel. */
  readonly headings?: Readonly<Record<string, readonly string[]>>
  /* What the panel prints over a control instead of the registry's name. An
     empty string prints nothing, for a column already headed; the registry's
     name is still what a screen reader hears. An array breaks the name where
     the panel breaks it — a name sets its column's width, so leaving the break
     to the browser leaves the section's width to the browser. */
  readonly labels?: Readonly<Record<string, string | readonly string[]>>
  /* For sections whose rows alternate between columns: lets a knob stand
     taller than its row so the switches set the row pitch, which is how the
     mixer stacks on the instrument. */
  readonly knobsOverlapRows?: boolean
  /* Draws the section to whatever width the rest of the row leaves it, instead
     of to its contents. The keyboard runs to the edge of the case, so its width
     is the row's to give rather than the artwork's to claim. */
  readonly fillsRow?: boolean
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

/* And these underneath, in this order: the performance strip stands at the left
   end of the keyboard, which is the whole of the instrument below the panel. */
export const BELOW_PANEL: readonly string[] = ['performance', 'keyboard']

const SECTIONS: Readonly<Record<string, SectionLayout>> = {
  controllers: {
    rows: [
      'tune              tune',
      'glide             modulationMix',
      'modulationSourceA modulationSourceB',
    ],
  },

  /* Oscillator-1 has no frequency knob, hence the gap in the middle column. */
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
      oscillatorModulation: ['Oscillator', 'Modulation'],
      osc3Control: ['Osc. 3', 'Control'],
    },
  },

  /* The switches share a column but not a side: each sits level with the knob
     it enables, alternating between the two knob columns. */
  mixer: {
    knobsOverlapRows: true,
    rows: [
      'osc1Volume osc1Enable          .                   .',
      '.          externalInputEnable externalInputVolume overloadLamp',
      'osc2Volume osc2Enable          .                   .',
      '.          noiseEnable         noiseVolume         noiseColour',
      'osc3Volume osc3Enable          .                   .',
    ],
    /* Only the top knob is headed; the switch beside each of the others already
       names its oscillator. */
    labels: {
      osc1Volume: 'Volume',
      osc2Volume: '',
      osc3Volume: '',
      externalInputVolume: ['External', 'Input Volume'],
    },
  },

  /* Two contours with identical markings, told apart only by their headings. */
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
    labels: {
      filterModulation: ['Filter', 'Modulation'],
      keyboardControl1: ['Keyboard', 'Control 1'],
      keyboardControl2: ['Keyboard', 'Control 2'],
      amountOfContour: ['Amount of', 'Contour'],
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

  /* The keys carry their own legend by being keys, so nothing is printed over
     them. */
  keyboard: {
    rows: ['keyboard'],
    labels: { keyboard: '' },
    fillsRow: true,
  },
}

export function layoutFor(sectionId: string): SectionLayout | undefined {
  return SECTIONS[sectionId]
}

/* Headings included: the renderer needs to tell a positioned control from one
   that has to flow. */
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

/* Columns take the width of their own widest control rather than an even
   share: the panel is scaled to the window, so space given to a switch's
   column comes off every knob. */
export function columnCount(rows: readonly string[]): number {
  return Math.max(...rows.map((row) => row.trim().split(/\s+/).length))
}

/* `grid-template-areas` wants each row quoted. */
export function templateAreas(rows: readonly string[]): string {
  return rows.map((row) => `"${row.trim().replace(/\s+/g, ' ')}"`).join(' ')
}
