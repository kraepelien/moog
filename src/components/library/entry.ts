import type { Visibility } from '@patch/schema.ts'
import type { Tone } from '@/tones.ts'

/* What one line of the library needs, and all the server sends for it: values
   are not here, because browsing never loads panel data. Assembled server-side
   because the ratings are — mine is mine, and only the server can see everyone
   else's to average them. */
export interface LibraryEntry {
  readonly id: string
  readonly name: string
  readonly origin: Origin
  /* Someone else's public patch is a user patch that is not mine. */
  readonly mine: boolean
  readonly ownerName: string | null
  readonly tags: readonly string[]
  readonly instrument: string
  readonly visibility: Visibility
  readonly approximate: boolean
  /* Mine, and null when I have not rated it. */
  readonly rating: number | null
  readonly averageRating: number | null
  readonly ratingCount: number
  readonly updatedAt: string
}

/* Half stars, shared with the server because both ends have to agree on what a
   rating may be: the route refuses anything else and the database's check
   constraint lists the same steps. 0 is not a step — it is unrated, which is
   what clearing a rating sends. */
export const RATING_STEP = 0.5
export const MAX_STARS = 5

export function isRating(stars: unknown): stars is number {
  if (typeof stars !== 'number' || !Number.isFinite(stars)) return false
  if (stars < 0 || stars > MAX_STARS) return false
  /* Exact for a step of 0.5, which has an exact double: a remainder test
     against a tenth would not be. */
  return Number.isInteger(stars / RATING_STEP)
}

/* Which store it came from, not a field on the patch: what makes a preset a
   preset is that it lives in the repo and nobody may write over it. */
export const ORIGINS = ['factory', 'user'] as const
export type Origin = (typeof ORIGINS)[number]

/* What the library calls a patch, which is not what the store calls it. A user
   patch is User to whoever owns it and Custom to everyone else, so two people
   reading the same row see different words — the origin is a fact about the
   patch, the bank is a fact about the patch and who is looking. */
export const BANKS = ['factory', 'user', 'custom'] as const
export type Bank = (typeof BANKS)[number]

export function bankOf(entry: Pick<LibraryEntry, 'origin' | 'mine'>): Bank {
  if (entry.origin === 'factory') return 'factory'
  return entry.mine ? 'user' : 'custom'
}

/* Assigned rather than hashed like a tag, because this is a closed set of three
   the code owns and the colours are the distinction: blue is you, here and on
   the stars of your own rating. */
export const BANK_TONES: Record<Bank, Tone> = {
  factory: 'red',
  user: 'blue',
  custom: 'violet',
}

export interface LibraryFilters {
  readonly text: string
  readonly tags: readonly string[]
  readonly instruments: readonly string[]
  readonly banks: readonly Bank[]
  readonly publicOnly: boolean
}

export const NO_FILTERS: LibraryFilters = {
  text: '',
  tags: [],
  instruments: [],
  banks: [],
  publicOnly: false,
}

/* An empty set of chips in a row means that row is not filtering, rather than
   that nothing matches it — otherwise opening the library would show nothing.
   Within a row the chips are an OR and the rows are an AND, which is what makes
   "bass or lead, on a Model D" sayable. */
export function matchesFilters(entry: LibraryEntry, filters: LibraryFilters): boolean {
  const text = filters.text.trim().toLowerCase()
  if (text !== '' && !entry.name.toLowerCase().includes(text)) {
    /* A tag is worth searching by name too: typing "bass" should find what the
       BASS chip finds, without making you notice the chip. */
    if (!entry.tags.some((tag) => tag.toLowerCase().includes(text))) return false
  }

  if (filters.tags.length > 0 && !filters.tags.some((tag) => entry.tags.includes(tag))) {
    return false
  }

  if (filters.instruments.length > 0 && !filters.instruments.includes(entry.instrument)) {
    return false
  }

  if (filters.banks.length > 0 && !filters.banks.includes(bankOf(entry))) return false

  if (filters.publicOnly && entry.visibility !== 'public') return false

  return true
}

/* What one chip on a row stands for. The rows draw the same chips the filter
   rows do, so pressing one reaches the same field — and only the filters know
   that "public" is a flag beside the banks rather than one of them. */
export type RowFilter =
  | { readonly kind: 'tag'; readonly value: string }
  | { readonly kind: 'instrument'; readonly value: string }
  | { readonly kind: 'bank'; readonly value: Bank }
  | { readonly kind: 'public' }

export function withFilter(filters: LibraryFilters, pressed: RowFilter): LibraryFilters {
  switch (pressed.kind) {
    case 'tag':
      return { ...filters, tags: toggled(filters.tags, pressed.value) }
    case 'instrument':
      return { ...filters, instruments: toggled(filters.instruments, pressed.value) }
    case 'bank':
      return { ...filters, banks: toggled(filters.banks, pressed.value) }
    case 'public':
      return { ...filters, publicOnly: !filters.publicOnly }
  }
}

export function toggled<T>(list: readonly T[], value: T): readonly T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}
