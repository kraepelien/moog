import type { Database } from 'bun:sqlite'
import type { TagInUse } from '@admin/tags.ts'

/* The list of categories an admin keeps. A patch stores the tag's name as a
   plain string and points at nothing, so retiring a row here leaves every patch
   already wearing it exactly as it was — and an exported patch still means
   something on a machine that has never heard of this table. */

export interface Tag {
  readonly id: number
  readonly name: string
  /* Null is the normal state: nobody has chosen, so every surface hashes the
     name into one of the five tag tones. A hex here overrides that everywhere
     the tag is drawn. */
  readonly colour: string | null
}

export function createTags(db: Database) {
  return {
    /* Ordered by name rather than by id, so the admin page's additions fall in
       among the first twelve instead of piling up after them. */
    list(): Tag[] {
      return db
        .query<Tag, []>(`select id, name, colour from tags order by name collate nocase`)
        .all()
    },

    /* The same list with the count the admin page needs to ask its question
       honestly: removing a tag takes it off the list and leaves every patch
       wearing it, so the page has to be able to say how many that is.

       Matched on the name because that is all a patch stores. */
    listInUse(): TagInUse[] {
      return db
        .query<TagInUse, []>(
          `select t.id, t.name, t.colour,
                  (select count(*) from patches p
                    where p.deleted_at is null
                      and exists (select 1 from json_each(p.tags) worn
                                   where worn.value = t.name collate nocase)) as patches
             from tags t
            order by t.name collate nocase`,
        )
        .all()
    },

    /* Case-insensitively, because 'Bass' and 'bass' in one list is a mistake
       nobody would make deliberately and the column's unique index allows it. */
    findByName(name: string): Tag | null {
      return (
        db
          .query<Tag, [string]>(`select id, name, colour from tags where name = ? collate nocase`)
          .get(name) ?? null
      )
    },

    insert(name: string): Tag {
      db.run(`insert into tags (name, created_at) values (?, ?)`, [name, new Date().toISOString()])
      return db.query<Tag, [string]>(`select id, name, colour from tags where name = ?`).get(name)!
    },

    insertMany(names: readonly string[]): number {
      const insert = db.prepare(`insert into tags (name, created_at) values (?, ?)`)
      const at = new Date().toISOString()
      db.transaction(() => {
        for (const name of names) insert.run(name, at)
      })()
      return names.length
    },

    /* Null clears it, which puts the tag back on the hash. */
    setColour(id: number, colour: string | null): Tag | null {
      db.run(`update tags set colour = ? where id = ?`, [colour, id])
      return (
        db.query<Tag, [number]>(`select id, name, colour from tags where id = ?`).get(id) ?? null
      )
    },

    delete(id: number): boolean {
      return db.run(`delete from tags where id = ?`, [id]).changes > 0
    },

    count(): number {
      return db.query<{ count: number }, []>(`select count(*) as count from tags`).get()?.count ?? 0
    },
  }
}

export type Tags = ReturnType<typeof createTags>
