/* Every number that turns a dial reading into a physical quantity, and where it
 * came from.
 *
 * The panel stores what the silkscreen says: a knob at 7 stores 7. Sounding it
 * needs hertz, seconds and gains, and `reference/` supplies almost none of them.
 * It gives geometry, the ranges behind four printed scales, and one table of
 * contour times; it states no cutoff frequency, no glide time, no LFO rate and
 * no oscillator interval. Every one of those is therefore a derivation, and the
 * house rule is that a guess is honest only when it says so.
 *
 * So each entry carries its source, and a test holds the line: anything not
 * marked `derived` must cite a path under `reference/`. When a real measurement
 * turns up, it replaces one entry here and no DSP moves.
 *
 * This file is also the tuning bench. Nothing downstream may write a number of
 * its own, so every adjustment made by ear is an edit in one place.
 */

export type Source =
  /* The panel prints it. */
  | 'printed'
  /* Recovered from the scans by tools/measure-artwork.py. */
  | 'measured'
  /* Reported from hardware in reference/control-values.md, second-hand there
     and second-hand here. */
  | 'reported'
  /* Ours, with the reasoning stated. */
  | 'derived'

export interface Entry {
  readonly value: number
  readonly unit: string
  readonly source: Source
  readonly why: string
}

const table = {
  lowestKey: {
    value: 29,
    unit: 'MIDI note',
    source: 'derived',
    why: "Moog names the keys F0 to C4 from a middle C called C3, an octave below MIDI's own numbering, which puts the bottom F at 29 and the top C at 72.",
  },

  /* Range positions, as octaves from 8'. An organ stop halves in pitch as the
     pipe doubles in length, so the printed feet are the mapping and only LO has
     to be decided. */
  rangeLo: {
    value: -3,
    unit: 'octaves from 8ft',
    source: 'derived',
    why: "One octave below 32', which puts the bottom key near 5 Hz: inaudible as a note and usable as a modulation source, which is what LO is for. The interval itself is not stated anywhere in reference/.",
  },
  range32: { value: -2, unit: 'octaves from 8ft', source: 'printed', why: "32' is two octaves below 8'; the panel prints both." },
  range16: { value: -1, unit: 'octaves from 8ft', source: 'printed', why: "16' is one octave below 8'." },
  range8: { value: 0, unit: 'octaves from 8ft', source: 'printed', why: "8' is an organ stop's unison pitch: the key sounds the note it names." },
  range4: { value: 1, unit: 'octaves from 8ft', source: 'printed', why: "4' is one octave above 8'." },
  range2: { value: 2, unit: 'octaves from 8ft', source: 'printed', why: "2' is two octaves above 8'." },

  /* One unit is one semitone on everything that detunes: Tune, both oscillator
     frequency knobs and the pitch wheel. Stated once because it makes those four
     agree with each other instead of each being separately invented. */
  semitonesPerUnit: {
    value: 1,
    unit: 'semitones per dial unit',
    source: 'derived',
    why: 'The frequency knobs print integers to 7 and travel to 8, so a unit is a musical step and the printed numerals are stops; a fifth either way is what that makes the knob worth. Nothing in reference/ states an interval.',
  },

  cutoffAtZero: {
    value: 440,
    unit: 'Hz',
    source: 'derived',
    why: 'Where the cutoff dial sits at its printed 0. Chosen at concert A so the centre of the sweep is a pitch rather than a round number of hertz; reference/control-values.md gives the dial range and no frequency at all.',
  },
  cutoffOctavesPerUnit: {
    value: 1.6,
    unit: 'octaves per dial unit',
    source: 'derived',
    why: 'Spreads the -5..+5 dial over roughly 16 octaves, so the ends reach below hearing and past Nyquist as the instrument does. Tuned by ear, not measured.',
  },

  emphasisQ: {
    value: 18,
    unit: 'Q at emphasis 10',
    source: 'derived',
    why: 'The resonance of one biquad section at the top of the knob. A ceiling rather than the instrument\'s behaviour: a ladder self-oscillates here and a biquad cascade only rings.',
  },

  /* Keyboard Control 1 and 2 add: neither is a third, both are the whole. */
  trackingStep: {
    value: 1 / 3,
    unit: 'fraction of full tracking per switch',
    source: 'derived',
    why: 'Two switches giving four amounts is the usual reading of the pair, with 1 alone a third and 2 alone two thirds. reference/ describes them as switches and says nothing about how far each tracks.',
  },
  trackingSecond: {
    value: 2,
    unit: 'steps for Keyboard Control 2',
    source: 'derived',
    why: 'The second switch is worth twice the first, which is what makes the four combinations evenly spaced.',
  },

  contourOctaves: {
    value: 4,
    unit: 'octaves at Amount of Contour 10',
    source: 'derived',
    why: 'How far the filter contour sweeps the cutoff wide open. Chosen so a full sweep is dramatic without leaving the audible band; nothing measured.',
  },

  glideSecondsPerOctave: {
    value: 0.6,
    unit: 'seconds per octave at Glide 10',
    source: 'derived',
    why: 'Glide is rate-based, so a wide leap takes longer than a semitone, which is what portamento does. reference/ gives no glide time.',
  },

  lfoLowHz: {
    value: 0.2,
    unit: 'Hz at LFO Rate 0',
    source: 'derived',
    why: 'The slow end of the modulation sweep.',
  },
  lfoHighHz: {
    value: 20,
    unit: 'Hz at LFO Rate 10',
    source: 'derived',
    why: 'The fast end, at the bottom of hearing so the LFO reaches audio rate as the instrument\'s does. Logarithmic between the two, since a rate knob is heard as a ratio.',
  },

  modulationCents: {
    value: 700,
    unit: 'cents at full modulation',
    source: 'derived',
    why: 'How far the modulation bus bends pitch with the wheel wide open. A fifth, which is about where a Minimoog vibrato stops being vibrato.',
  },
  modulationCutoffCents: {
    value: 2400,
    unit: 'cents at full modulation',
    source: 'derived',
    why: 'The same bus on the filter, where two octaves is a sweep rather than a wobble.',
  },

  a440: {
    value: 440,
    unit: 'Hz',
    source: 'printed',
    why: 'The panel prints A-440 on the switch. The only frequency the instrument states.',
  },

  /* Levels. Four sources at 10 would sum past full scale, so the mixer divides
     by its own count rather than clipping. */
  mixerHeadroom: {
    value: 4,
    unit: 'sources at full',
    source: 'derived',
    why: 'Three oscillators and the noise, so everything wide open reaches full scale instead of overdriving. The instrument\'s mixer does overdrive, which this does not model.',
  },
  volumeTaper: {
    value: 2,
    unit: 'exponent',
    source: 'derived',
    why: 'Level knobs are heard as a curve rather than as a line, so a knob at 5 is a quarter of full rather than half.',
  },

  releaseFloorMs: {
    value: 6,
    unit: 'ms',
    source: 'derived',
    why: 'The release when the Decay switch is off. Not zero: an instant cut clicks, and the instrument does not click.',
  },
  smoothingMs: {
    value: 8,
    unit: 'ms',
    source: 'derived',
    why: 'How long a knob takes to arrive at its new value. A property of doing this in software, not of the instrument: without it every turn is a step and a step is a click.',
  },
} as const satisfies Readonly<Record<string, Entry>>

export type CalibrationName = keyof typeof table

export const calibration: Readonly<Record<CalibrationName, Entry>> = table

/* The numbers alone, for the code that needs the quantity and not the argument
   about where it came from. */
export const cal = Object.fromEntries(
  Object.entries(table).map(([name, entry]) => [name, entry.value]),
) as Readonly<Record<CalibrationName, number>>
