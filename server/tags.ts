import type { Database } from 'bun:sqlite'
import { type TagInUse, tagNameProblem } from '../src/admin/tags.ts'

/* The list of categories an admin keeps. A patch stores the tag's name as a
   plain string and points at nothing, so retiring a row here leaves every patch
   already wearing it exactly as it was — and an exported patch still means
   something on a machine that has never heard of this table.

   Unlike instruments, this is **seeded once rather than synced**. Instruments
   are code: a registry, artwork and codecs, so the image is the authority and
   re-asserting them on every start is right. Categories are somebody's
   editorial list, and re-asserting these would undo a deletion at the next
   restart — the admin page would appear not to work. */

export const INITIAL_TAGS: readonly string[] = [
  'Bass',
  'Lead',
  'Pluck',
  'Bell',
  'Synth',
  'Keys',
  'Brass',
  'Strings',
  'Pad',
  'Stabs',
  'Drones',
  'FX',
]

export interface Tag {
  readonly id: number
  readonly name: string
}

/* Only into an empty table, which is what makes this a starting point rather
   than a default that keeps coming back. Returns how many it wrote so a start
   can say whether it was a first one. */
export function seedTags(db: Database, names: readonly string[] = INITIAL_TAGS): number {
  const held = db.query<{ count: number }, []>(`select count(*) as count from tags`).get()
  if (held && held.count > 0) return 0

  const insert = db.prepare(`insert into tags (name, created_at) values (?, ?)`)
  const at = new Date().toISOString()
  db.transaction(() => {
    for (const name of names) insert.run(name, at)
  })()
  return names.length
}

/* Ordered by name rather than by id, so the admin page's additions fall in
   among the first twelve instead of piling up after them. */
export function listTags(db: Database): Tag[] {
  return db.query<Tag, []>(`select id, name from tags order by name collate nocase`).all()
}

/* The same list with the count the admin page needs to ask its question
   honestly: removing a tag takes it off the list and leaves every patch
   wearing it, so the page has to be able to say how many that is.

   Matched on the name because that is all a patch stores. */
export function listTagsInUse(db: Database): TagInUse[] {
  return db
    .query<TagInUse, []>(
      `select t.id, t.name,
              (select count(*) from patches p
                where p.deleted_at is null
                  and exists (select 1 from json_each(p.tags) worn
                               where worn.value = t.name collate nocase)) as patches
         from tags t
        order by t.name collate nocase`,
    )
    .all()
}

export type TagRefusal = 'invalid' | 'taken'

/* Case-insensitively unique: 'Bass' and 'bass' in one list is a mistake nobody
   would make deliberately, and the column's own unique index would allow it. */
export function addTag(db: Database, name: string): Tag | TagRefusal {
  const trimmed = name.trim()
  if (tagNameProblem(trimmed) !== null) return 'invalid'

  const held = db
    .query<{ id: number }, [string]>(`select id from tags where name = ? collate nocase`)
    .get(trimmed)
  if (held) return 'taken'

  db.run(`insert into tags (name, created_at) values (?, ?)`, [trimmed, new Date().toISOString()])
  return db.query<Tag, [string]>(`select id, name from tags where name = ?`).get(trimmed)!
}

export function removeTag(db: Database, id: number): boolean {
  return db.run(`delete from tags where id = ?`, [id]).changes > 0
}
