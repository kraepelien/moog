import type { Visibility } from '../../patch/schema.ts'

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

/* Which store it came from, not a field on the patch: what makes a preset a
   preset is that it lives in the repo and nobody may write over it. */
export const ORIGINS = ['factory', 'user'] as const
export type Origin = (typeof ORIGINS)[number]

export interface LibraryFilters {
  readonly text: string
  readonly tags: readonly string[]
  readonly instruments: readonly string[]
  readonly origins: readonly Origin[]
  readonly publicOnly: boolean
}

export const NO_FILTERS: LibraryFilters = {
  text: '',
  tags: [],
  instruments: [],
  origins: [],
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

  if (filters.origins.length > 0 && !filters.origins.includes(entry.origin)) return false

  if (filters.publicOnly && entry.visibility !== 'public') return false

  return true
}

export function toggled<T>(list: readonly T[], value: T): readonly T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}
