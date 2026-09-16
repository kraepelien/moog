import type { Patch, Visibility } from '../../patch/schema.ts'
import type { PatchSummary } from '../../storage/types.ts'

/* What one line of the library needs. Both stores supply the same fields — a
   preset arrives whole and a saved patch arrives as a summary carrying the
   metadata the library filters on — so a row never has to tell "no tags" from
   "not fetched", and every line draws the same set of chips. */
export interface LibraryEntry {
  readonly id: string
  readonly name: string
  readonly origin: Origin
  readonly tags: readonly string[]
  readonly instrument: string
  readonly visibility: Visibility
  readonly approximate: boolean
  /* No field in the patch schema carries this yet. */
  readonly rating: number | null
  readonly updatedAt: string
}

/* Which store it came from, not a field on the patch: what makes a preset a
   preset is that it lives in the repo and nobody may write over it. */
export const ORIGINS = ['factory', 'user'] as const
export type Origin = (typeof ORIGINS)[number]

export function entryFromPreset(preset: Patch): LibraryEntry {
  return {
    id: preset.id,
    name: preset.name,
    origin: 'factory',
    tags: preset.tags,
    instrument: preset.instrument,
    visibility: preset.visibility,
    approximate: preset.approximate,
    rating: null,
    updatedAt: preset.updatedAt,
  }
}

export function entryFromSummary(summary: PatchSummary): LibraryEntry {
  return {
    id: summary.id,
    name: summary.name,
    origin: 'user',
    tags: summary.tags,
    instrument: summary.instrument,
    visibility: summary.visibility,
    /* Not in the summary: it says whether the values are a reconstruction, which
       is a claim about values the list does not carry. */
    approximate: false,
    rating: null,
    updatedAt: summary.updatedAt,
  }
}

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
