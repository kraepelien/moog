import { bankOf, scoreOf, type LibraryEntry } from '@components/library/entry.ts'

/* What the home page can say without asking the server for anything. The
   library rows are already loaded for the rail's count, and the registry is a
   module, so every figure here is arithmetic over things the app has in hand —
   which is what keeps the page instant and keeps it honest about the one bank
   it can see. */
export interface Facts {
  readonly total: number
  readonly factory: number
  /* Saved by whoever is looking, which is not every patch that is not factory:
     someone else's published patch is in the library and is not theirs. */
  readonly mine: number
  readonly rated: number
  /* The mean of the per-patch averages, over the patches that carry one. Not
     the mean of every rating ever given: the server sends one number per patch
     and not the count behind it. */
  readonly average: number | null
  readonly panel: Panel
}

/* The instrument's own two numbers, handed in rather than read here: the
   registry and the list of what cannot be modelled are the authorities on
   them, and this file is arithmetic over a library. */
export interface Panel {
  readonly controls: number
  /* The ones that make a sound, which is not all of them: what cannot be
     modelled is listed in SILENT, with its reason. */
  readonly audible: number
}

export function factsOf(entries: readonly LibraryEntry[], panel: Panel): Facts {
  let factory = 0
  let mine = 0
  let rated = 0
  let total = 0

  for (const entry of entries) {
    const bank = bankOf(entry)
    if (bank === 'factory') factory += 1
    if (bank === 'user') mine += 1
    if (entry.averageRating !== null) {
      rated += 1
      total += entry.averageRating
    }
  }

  return {
    total: entries.length,
    factory,
    mine,
    rated,
    average: rated === 0 ? null : total / rated,
    panel,
  }
}

/* One column of the strip: the word above, the number, the sentence under it. */
export interface Figure {
  readonly kicker: string
  /* Null when there is no number to print, rather than a dash baked in: the
     strip draws that case quietly instead of setting an em dash in the same
     weight as a real figure, where it reads as a rule through the column. */
  readonly value: string | null
  readonly caption: string
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many)

export function figuresOf(facts: Facts): readonly Figure[] {
  const saved = facts.total - facts.factory
  return [
    {
      kicker: 'Library',
      value: String(facts.total),
      caption: `${facts.factory} factory, ${saved} user`,
    },
    /* Not "Yours": a card in the shelf below wears that word as its bank, and
       one page saying it of two different counts is one word too few. */
    {
      kicker: 'Your bank',
      value: String(facts.mine),
      caption: facts.mine === 0 ? 'nothing saved yet' : 'saved by you',
    },
    {
      kicker: 'Panel',
      value: String(facts.panel.controls),
      caption: `controls, ${facts.panel.audible} of them audible`,
    },
    {
      kicker: 'Rated',
      value: facts.average === null ? null : facts.average.toFixed(1),
      caption:
        facts.rated === 0
          ? 'nothing rated yet'
          : `across ${facts.rated} ${plural(facts.rated, 'patch', 'patches')}`,
    },
  ]
}

/* Newest first. `localeCompare` on the stored ISO strings rather than parsing
   two dates per comparison, which is what the library store already sorts by. */
export function recent(entries: readonly LibraryEntry[], count: number): readonly LibraryEntry[] {
  return [...entries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, count)
}

/* Best first, by the same weighted score the library's Order row reads, which
   is why it lives in `entry.ts`. Ties break on recency and then on name,
   so a shelf of patches nobody has rated is at least the same shelf on every
   load rather than whatever order the rows arrived in. */
export function ranked(entries: readonly LibraryEntry[], count: number): readonly LibraryEntry[] {
  return [...entries]
    .map((entry) => ({ entry, score: scoreOf(entry) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.entry.updatedAt.localeCompare(a.entry.updatedAt) ||
        a.entry.name.localeCompare(b.entry.name),
    )
    .slice(0, count)
    .map((scored) => scored.entry)
}

export interface Shelf {
  readonly title: string
  readonly entries: readonly LibraryEntry[]
}

/* Your own work first and newest first, because that is where you left off;
   topped up with the best of the rest, so a bank of one is still a row of four
   and the patches you have not saved are the ones worth hearing.

   The heading follows what is actually in it. Every factory patch is stamped at
   the same moment by the seed, so recency says nothing about a library nobody
   has saved to — and "pick up where you left off" would be pointing at
   somewhere nobody has been. */
export function shelfOf(entries: readonly LibraryEntry[], count: number): Shelf {
  const mine = recent(
    entries.filter((entry) => bankOf(entry) === 'user'),
    count,
  )
  const rest = ranked(
    entries.filter((entry) => bankOf(entry) !== 'user'),
    count - mine.length,
  )
  return {
    title: mine.length > 0 ? 'Pick up where you left off' : 'Start with one of these',
    entries: [...mine, ...rest],
  }
}
