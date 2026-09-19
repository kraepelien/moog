import type { Origin } from '@components/library/entry.ts'
import type { Visibility } from './schema.ts'

/* One patch as somebody administering them sees it: who owns it, whether it is
   published, and whether it is in the trash. Shared with the server, which is
   what fills it in.

   Not a `Patch` and not a `LibraryEntry`. It carries no `values`, which is what
   keeps a later `?page=` cheap on a list that is every patch on the install
   rather than every patch one person may see, and it carries an owner and a
   deletion, which neither of the other two has any business knowing about.

   Named for the domain rather than for the page, because the trash a person
   keeps of their own reads the same row and is not an administrative thing. */
export interface PatchRecord {
  readonly id: string
  readonly name: string
  readonly origin: Origin
  /* Null for a factory patch, which belongs to the bank rather than a person. */
  readonly ownerUid: string | null
  readonly ownerName: string | null
  readonly tags: readonly string[]
  readonly instrument: string
  readonly visibility: Visibility
  readonly updatedAt: string
  /* Null while it is live. */
  readonly deletedAt: string | null
  /* When the nightly sweep will take it for good, worked out on the server from
     the trash window: the number a person needs is per row, and telling the
     browser the window would be handing it a rule it then has to reimplement. */
  readonly purgeAt: string | null
}

export function matchesPatch(record: PatchRecord, query: string): boolean {
  const wanted = query.trim().toLowerCase()
  if (wanted === '') return true
  return [record.name, record.ownerName, record.id, ...record.tags].some(
    (field) => field !== null && field.toLowerCase().includes(wanted),
  )
}

/* Rounded up, so the last day reads "1 day" rather than "0 days" for its whole
   length. Negative where the sweep is overdue, which is a real state and not a
   bug: only `bun run serve` purges, once a day, and the dev server never does,
   so a row can outlive its own `purgeAt`. Whoever draws this says so in words
   rather than printing a negative. */
export function daysLeft(purgeAt: string | null, now: number = Date.now()): number | null {
  if (purgeAt === null) return null
  const at = Date.parse(purgeAt)
  if (Number.isNaN(at)) return null
  return Math.ceil((at - now) / (24 * 60 * 60 * 1000))
}
