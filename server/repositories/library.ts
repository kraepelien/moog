import type { Database } from 'bun:sqlite'
import type { LibraryEntry } from '../../src/components/library/entry.ts'
import type { Visibility } from '../../src/patch/schema.ts'

/* One row per patch the viewer may see, assembled here because only the server
   can see everyone's ratings: my stars come from my row, the average from all
   of them. The client then searches, filters and sorts in memory, so typing is
   instant and a chip costs no round trip.

   Control values are not in a row. Browsing the library never loads panel
   data; opening a patch is a second request. */

interface Row {
  id: string
  name: string
  slug: string | null
  ownerMine: number
  ownerName: string | null
  tags: string
  instrument: string
  visibility: string
  approximate: number
  myRating: number | null
  averageRating: number | null
  ratingCount: number
  updatedAt: string
}

const SQL = `
  select coalesce(p.slug, p.uid) as id,
         p.name,
         p.slug,
         case when p.owner_id is not null and p.owner_id = $viewer then 1 else 0 end as ownerMine,
         o.display_name as ownerName,
         p.tags,
         i.slug as instrument,
         p.visibility,
         p.approximate,
         mine.stars as myRating,
         (select avg(stars) from ratings where patch_id = p.id) as averageRating,
         (select count(*) from ratings where patch_id = p.id) as ratingCount,
         p.updated_at as updatedAt
    from patches p
    join instruments i on i.id = p.instrument_id
    left join users o on o.id = p.owner_id
    left join ratings mine on mine.patch_id = p.id and mine.user_id = $viewer
   where p.deleted_at is null
     and (p.slug is not null or p.visibility = 'public' or p.owner_id = $viewer)
     and ($instrument is null or i.slug = $instrument)
   order by p.name collate nocase`

export function createLibrary(db: Database) {
  return {
    entriesFor(viewer: number | null, instrument: string | null = null): LibraryEntry[] {
      return db
        .query<Row, { $viewer: number | null; $instrument: string | null }>(SQL)
        .all({ $viewer: viewer, $instrument: instrument })
        .map((row) => ({
          id: row.id,
          name: row.name,
          origin: row.slug === null ? ('user' as const) : ('factory' as const),
          mine: row.ownerMine === 1,
          ownerName: row.ownerName,
          tags: JSON.parse(row.tags) as string[],
          instrument: row.instrument,
          visibility: row.visibility as Visibility,
          approximate: row.approximate === 1,
          rating: row.myRating,
          /* Rounded to a half star, which is as fine as the stars can draw. */
          averageRating: row.averageRating === null ? null : Math.round(row.averageRating * 2) / 2,
          ratingCount: row.ratingCount,
          updatedAt: row.updatedAt,
        }))
    },
  }
}

export type Library = ReturnType<typeof createLibrary>
