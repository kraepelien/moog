/* The six waveform marks, lifted verbatim from "OSC. 1 (1).svg" and split out so
   each can be drawn on its own — beside the knob, in the cap, or in a legend.

   Each keeps the coordinates it was exported with, which is also where it belongs
   around the knob, so drawing all six needs no placement maths. `box` is the tight
   bounds of the path, for drawing one standalone at any size. */

export interface Glyph {
  readonly path: string
  readonly box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
}

export const waveformGlyphs = {
  triangle: {
    path: 'M0.651184 49.0276L4.65118 42.0276L8.65118 49.0276',
    box: { x: 0.15, y: 41.5, width: 9, height: 8 },
  },
  triangleSaw: {
    path: 'M15.6512 23.0274L19.6512 16.0274L19.6512 20.5274L23.6512 23.0274',
    box: { x: 15.15, y: 15.5, width: 9, height: 8 },
  },
  sawtooth: {
    path: 'M38.6512 9.02747L44.6512 2.02747L44.6512 9.02747',
    box: { x: 38.15, y: 1.5, width: 7, height: 8 },
  },
  square: {
    path: 'M73.6664 9.0275L73.6664 2.0275L77.6511 2.02743L77.6512 8.28409L80.6512 8.28409',
    box: { x: 73.15, y: 1.5, width: 8, height: 8 },
  },
  widePulse: {
    path: 'M96.6666 23.744L96.6666 16.744L99.6513 16.7439L99.6513 23.0005L103.651 23.0005',
    box: { x: 96.15, y: 16.2, width: 8, height: 7.5 },
  },
  narrowPulse: {
    path: 'M109.667 49.4963L109.667 42.4963L112.151 42.5276L112.151 48.7842L117.651 48.7842',
    box: { x: 109.15, y: 42, width: 9, height: 8 },
  },
} as const satisfies Record<string, Glyph>

export type WaveformId = keyof typeof waveformGlyphs

/* In the order they sit on the knob, counter-clockwise end first. */
export const waveformOrder: readonly WaveformId[] = [
  'triangle',
  'triangleSaw',
  'sawtooth',
  'square',
  'widePulse',
  'narrowPulse',
]
