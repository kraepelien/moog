/* The library's chip and action colours, apart from panelPalette.css because
   they are the chrome's rather than the instrument's: the panel is black ink on
   white and these are not sampled from anything, they are a UI palette.

   In TypeScript rather than CSS custom properties because MUI's theme and the
   tag-to-tone assignment both need the values as data. */

export const TONES = ['pink', 'amber', 'green', 'blue', 'violet', 'grey'] as const
export type Tone = (typeof TONES)[number]

export interface ToneColour {
  readonly ink: string
  readonly field: string
  /* The same hue behind a chip that is switched on. */
  readonly strong: string
}

/* Coloured text on a wash of the same hue rather than a solid fill: at this size
   a filled chip reads as a button, and the row already has real buttons in it. */
export const TONE_COLOURS: Record<Tone, ToneColour> = {
  pink: { ink: '#ff6f9c', field: 'rgb(255 111 156 / 12%)', strong: 'rgb(255 111 156 / 26%)' },
  amber: { ink: '#e8c257', field: 'rgb(232 194 87 / 12%)', strong: 'rgb(232 194 87 / 26%)' },
  green: { ink: '#69dd94', field: 'rgb(105 221 148 / 12%)', strong: 'rgb(105 221 148 / 26%)' },
  blue: { ink: '#74aaff', field: 'rgb(116 170 255 / 12%)', strong: 'rgb(116 170 255 / 26%)' },
  violet: { ink: '#b78bff', field: 'rgb(183 139 255 / 12%)', strong: 'rgb(183 139 255 / 26%)' },
  grey: { ink: '#9a9aa4', field: 'rgb(255 255 255 / 8%)', strong: 'rgb(255 255 255 / 18%)' },
}

/* Tags are plain strings an admin can add to and retire, so a hand-kept colour
   map would leave new ones uncoloured and dead entries behind. Hashing instead
   means a tag keeps one colour everywhere it appears without anyone choosing it,
   and the colour carries no meaning — it is there to tell chips apart. */
const TAG_TONES: readonly Tone[] = ['pink', 'amber', 'green', 'blue', 'violet']

export function toneForTag(tag: string): Tone {
  let hash = 0
  for (const character of tag.toUpperCase()) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return TAG_TONES[hash % TAG_TONES.length]!
}

/* The page and its cards. The design puts the body at black and lifts each card
   a little off it, so a card's edge is the only thing dividing them. */
export const SHELL = {
  page: '#000000',
  card: '#0e0e11',
  field: '#161619',
  edge: 'rgb(255 255 255 / 9%)',
  ink: '#e9e9ec',
  inkDim: '#8b8b95',
  star: '#f2b01e',
} as const
