/* The library's chip and action colours, apart from panelPalette.css because
   they are the chrome's rather than the instrument's: the panel is black ink on
   white and these are not sampled from anything, they are a UI palette.

   Every value here is a reference to a custom property `shellPalette.css`
   declares, not a colour. That is what lets the layout page repaint the app
   without a component being told: the preview is written onto :root and the
   browser resolves these afresh. `DEFAULT_SKIN` below holds the actual hexes,
   once, for the page that edits them and for anything that has to reset. */

export const TONES = ['red', 'pink', 'amber', 'green', 'blue', 'violet', 'grey'] as const
export type Tone = (typeof TONES)[number]

export interface ToneColour {
  readonly ink: string
  readonly field: string
  /* The same hue behind a chip that is switched on. */
  readonly strong: string
}

/* A wash and a switched-on wash, mixed from one ink by the browser. Exported
   because a tag's colour is a hex an administrator typed rather than a custom
   property anybody could have declared in advance, and it has to arrive at the
   same three shades the named tones do. */
export function shadesOf(ink: string): ToneColour {
  return {
    ink,
    field: `color-mix(in srgb, ${ink} 12%, transparent)`,
    strong: `color-mix(in srgb, ${ink} 26%, transparent)`,
  }
}

const toneVars = (tone: Tone): ToneColour => ({
  ink: `var(--tone-${tone}-ink)`,
  field: `var(--tone-${tone}-field)`,
  strong: `var(--tone-${tone}-strong)`,
})

export const TONE_COLOURS: Record<Tone, ToneColour> = Object.fromEntries(
  TONES.map((tone) => [tone, toneVars(tone)]),
) as Record<Tone, ToneColour>

/* Tags are plain strings an admin can add to and retire, so a hand-kept colour
   map would leave new ones uncoloured and dead entries behind. Hashing instead
   means a tag keeps one colour everywhere it appears without anyone choosing it,
   and the colour carries no meaning — it is there to tell chips apart. A colour
   set on the tag itself beats this; see `tagColour`.

   Red stays out of the rotation rather than joining it: a sixth tone repoints
   the modulo, and every tag already in use changes colour. */
const TAG_TONES: readonly Tone[] = ['pink', 'amber', 'green', 'blue', 'violet']

export function toneForTag(tag: string): Tone {
  let hash = 0
  for (const character of tag.toUpperCase()) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return TAG_TONES[hash % TAG_TONES.length]!
}

/* What colour an admin chose for a tag, keyed by the name a patch stores. A
   patch points at no row, so a tag it wears that the list has since forgotten
   simply falls back to the hash. */
export type TagPalette = Readonly<Record<string, string>>

export function tagColour(palette: TagPalette, tag: string): ToneColour {
  const chosen = palette[tag]
  return chosen === undefined ? TONE_COLOURS[toneForTag(tag)] : shadesOf(chosen)
}

/* The page and its cards. The design puts the body at black and lifts each card
   a little off it, so a card's edge is the only thing dividing them. */
export const SHELL = {
  page: 'var(--shell-page)',
  card: 'var(--shell-card)',
  field: 'var(--shell-field)',
  edge: 'var(--shell-edge)',
  ink: 'var(--shell-ink)',
  inkDim: 'var(--shell-ink-dim)',
  star: 'var(--shell-star)',
  bar: 'var(--shell-bar)',
  barInk: 'var(--shell-bar-ink)',
  hoverFaint: 'var(--shell-hover-faint)',
  hoverStrong: 'var(--shell-hover-strong)',
} as const

/* Every colour a skin may set, in the order the page that edits them draws
   them, with the custom property each one writes and what it is for. One list:
   the admin page builds its fields from it, the export names them from it, and
   a stored preview is sifted against it, so none of the three can drift. */
export const SKIN_GROUPS = ['Shell', 'Tones', 'Panel', 'Caps', 'Lamps', 'Keys'] as const
export type SkinGroup = (typeof SKIN_GROUPS)[number]

/* Where each default is declared. Two stylesheets, because the chrome's colours
   and the instrument's are kept apart: the panel's were measured off the scans
   and the chrome's were chosen. A swatch carries its own, so the export names
   the file somebody actually has to edit rather than assuming one of them. */
export const SKIN_SHEETS = {
  shell: 'src/shellPalette.css',
  panel: 'src/panelPalette.css',
} as const
export type SkinSheet = keyof typeof SKIN_SHEETS

export interface SkinSwatch {
  readonly key: string
  readonly property: string
  readonly label: string
  readonly group: SkinGroup
  readonly hint: string
  readonly sheet: SkinSheet
}

export const SKIN_SWATCHES: readonly SkinSwatch[] = [
  { key: 'page', property: '--shell-page', label: 'Page', group: 'Shell', hint: 'Behind everything', sheet: 'shell' },
  { key: 'card', property: '--shell-card', label: 'Card', group: 'Shell', hint: 'Every panel and list', sheet: 'shell' },
  { key: 'field', property: '--shell-field', label: 'Field', group: 'Shell', hint: 'Inside a text box', sheet: 'shell' },
  { key: 'edge', property: '--shell-edge', label: 'Edge', group: 'Shell', hint: 'Every rule and border', sheet: 'shell' },
  { key: 'ink', property: '--shell-ink', label: 'Ink', group: 'Shell', hint: 'Body text', sheet: 'shell' },
  { key: 'inkDim', property: '--shell-ink-dim', label: 'Dim ink', group: 'Shell', hint: 'Captions and counts', sheet: 'shell' },
  { key: 'star', property: '--shell-star', label: 'Star', group: 'Shell', hint: "Everyone's rating", sheet: 'shell' },
  { key: 'bar', property: '--shell-bar', label: 'Top bar', group: 'Shell', hint: 'The header strip', sheet: 'shell' },
  { key: 'barInk', property: '--shell-bar-ink', label: 'Top bar ink', group: 'Shell', hint: 'Its tabs and icons', sheet: 'shell' },
  { key: 'red', property: '--tone-red-ink', label: 'Red', group: 'Tones', hint: 'Factory', sheet: 'shell' },
  { key: 'pink', property: '--tone-pink-ink', label: 'Pink', group: 'Tones', hint: 'Delete, and a tag', sheet: 'shell' },
  { key: 'amber', property: '--tone-amber-ink', label: 'Amber', group: 'Tones', hint: 'Unsaved, public, a tag', sheet: 'shell' },
  { key: 'green', property: '--tone-green-ink', label: 'Green', group: 'Tones', hint: 'Saved, synth, a tag', sheet: 'shell' },
  { key: 'blue', property: '--tone-blue-ink', label: 'Blue', group: 'Tones', hint: 'Yours, and a tag', sheet: 'shell' },
  { key: 'violet', property: '--tone-violet-ink', label: 'Violet', group: 'Tones', hint: "Somebody else's, and a tag", sheet: 'shell' },
  { key: 'grey', property: '--tone-grey-ink', label: 'Grey', group: 'Tones', hint: 'Said without emphasis', sheet: 'shell' },
  { key: 'hover', property: '--shell-hover', label: 'Hover', group: 'Shell', hint: 'The wash under the pointer', sheet: 'shell' },

  /* The instrument's own, from panelPalette.css. Measured off the scans rather
     than chosen, so they ship as they were sampled — and every one is settable
     anyway, because a skin is somebody playing rather than a correction. */
  { key: 'panel', property: '--moog-panel', label: 'Panel', group: 'Panel', hint: 'The fascia', sheet: 'panel' },
  { key: 'panelInk', property: '--moog-ink', label: 'Panel ink', group: 'Panel', hint: 'Legends and line art', sheet: 'panel' },
  { key: 'capOrange', property: '--cap-orange', label: 'Orange cap', group: 'Caps', hint: 'Modulation and filter', sheet: 'panel' },
  { key: 'capOrangeEdge', property: '--cap-orange-edge', label: 'Orange edge', group: 'Caps', hint: 'Its shadowed side', sheet: 'panel' },
  { key: 'capBlue', property: '--cap-blue', label: 'Blue cap', group: 'Caps', hint: 'Mixer and output', sheet: 'panel' },
  { key: 'capBlueEdge', property: '--cap-blue-edge', label: 'Blue edge', group: 'Caps', hint: 'Its shadowed side', sheet: 'panel' },
  { key: 'capBlack', property: '--cap-black', label: 'Black cap', group: 'Caps', hint: 'Modulation source', sheet: 'panel' },
  { key: 'capBlackEdge', property: '--cap-black-edge', label: 'Black edge', group: 'Caps', hint: 'Its shadowed side', sheet: 'panel' },
  { key: 'capWhite', property: '--cap-white', label: 'White cap', group: 'Caps', hint: 'Glide and Decay', sheet: 'panel' },
  { key: 'capWhiteEdge', property: '--cap-white-edge', label: 'White edge', group: 'Caps', hint: 'Its shadowed side', sheet: 'panel' },
  { key: 'capRocker', property: '--cap-rocker', label: 'Rocker band', group: 'Caps', hint: 'Beside every switch', sheet: 'panel' },
  { key: 'capRockerDark', property: '--cap-rocker-dark', label: 'Rocker, black cap', group: 'Caps', hint: 'The one dark band', sheet: 'panel' },
  { key: 'lampRed', property: '--lamp-red', label: 'Pilot lamp', group: 'Lamps', hint: 'Lit whenever it is on', sheet: 'panel' },
  { key: 'lampRedDark', property: '--lamp-red-dark', label: 'Pilot, unlit', group: 'Lamps', hint: 'Its glass with no lamp', sheet: 'panel' },
  { key: 'lampAmber', property: '--lamp-amber', label: 'Overload lamp', group: 'Lamps', hint: 'Lit when it is driven', sheet: 'panel' },
  { key: 'lampAmberDark', property: '--lamp-amber-dark', label: 'Overload, unlit', group: 'Lamps', hint: 'Its glass with no lamp', sheet: 'panel' },
  { key: 'keyNatural', property: '--key-natural', label: 'Natural', group: 'Keys', hint: 'The long keys', sheet: 'panel' },
  { key: 'keySharp', property: '--key-sharp', label: 'Sharp', group: 'Keys', hint: 'The short keys', sheet: 'panel' },
  { key: 'keyNaturalHeld', property: '--key-natural-held', label: 'Natural, down', group: 'Keys', hint: 'While it is played', sheet: 'panel' },
  { key: 'keySharpHeld', property: '--key-sharp-held', label: 'Sharp, down', group: 'Keys', hint: 'While it is played', sheet: 'panel' },
]

export const SKIN_KEYS: readonly string[] = SKIN_SWATCHES.map((swatch) => swatch.key)

/* What the stylesheets declare, written out again so the page that edits a skin
   can show what a field will fall back to and offer to put it back.
   `test/skin.test.ts` fails if a copy ever disagrees with its sheet. */
export const DEFAULT_SKIN: Readonly<Record<string, string>> = {
  page: '#000000',
  card: '#101012',
  field: '#19191e',
  edge: '#1d1d24',
  ink: '#e9e9ec',
  inkDim: '#8b8b95',
  star: '#f2b01e',
  bar: '#101012',
  barInk: '#e9e9ec',
  red: '#f2594b',
  pink: '#ff6f9c',
  amber: '#e8c257',
  green: '#69dd94',
  blue: '#74aaff',
  violet: '#b78bff',
  grey: '#9a9aa4',
  hover: '#ffffff',
  panel: '#000000',
  panelInk: '#ffffff',
  capOrange: '#f37c3e',
  capOrangeEdge: '#b75c30',
  capBlue: '#96c4d4',
  capBlueEdge: '#6d94a1',
  capBlack: '#626366',
  capBlackEdge: '#4b4c4f',
  capWhite: '#e8e7e3',
  capWhiteEdge: '#c9c6c1',
  capRocker: '#cbcdce',
  capRockerDark: '#39383a',
  lampRed: '#c64355',
  lampRedDark: '#3a1016',
  lampAmber: '#ff7a30',
  lampAmberDark: '#3a1a0e',
  keyNatural: '#ffffff',
  keySharp: '#000000',
  keyNaturalHeld: '#9a9a9a',
  keySharpHeld: '#3a3a3a',
}

/* A skin is partial: a key it leaves out is the default, so a preview kept from
   an older build never has to be migrated when a colour is added above. */
export type Skin = Readonly<Record<string, string>>

/* Six or three digits, with the hash. A colour arriving from a form or out of
   session storage ends up in a style attribute, and `red; background: url(...)`
   is not a colour. Shared with the server, which holds tag colours to the same
   rule. */
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

export function isHexColour(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value)
}

/* Only the keys the app knows, only real colours, lower case so two spellings
   of one colour are one value. */
export function cleanSkin(raw: unknown): Skin {
  if (raw === null || typeof raw !== 'object') return {}
  const kept: Record<string, string> = {}
  for (const key of SKIN_KEYS) {
    const value = (raw as Record<string, unknown>)[key]
    if (isHexColour(value)) kept[key] = value.toLowerCase()
  }
  return kept
}
