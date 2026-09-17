import type { Database } from 'bun:sqlite'

/* Stars are the viewer's, never the patch's: two people rating the same sound
   must not overwrite each other, and a rating is not part of what a patch is. */

export function createRatings(db: Database) {
  return {
    /* 0 means unrated, which is a row removed rather than a zero stored — the
       column's own check constraint has no 0 among its steps. */
    set(userId: number, patchUid: string, stars: number): boolean {
      const patch = db
        .query<{ id: number }, [string, string]>(`select id from patches where uid = ? or slug = ?`)
        .get(patchUid, patchUid)
      if (!patch) return false

      if (stars === 0) {
        db.run(`delete from ratings where user_id = ? and patch_id = ?`, [userId, patch.id])
        return true
      }
      db.run(
        `insert into ratings (user_id, patch_id, stars, updated_at) values (?, ?, ?, ?)
         on conflict(user_id, patch_id) do update set stars = excluded.stars,
                                                      updated_at = excluded.updated_at`,
        [userId, patch.id, stars, new Date().toISOString()],
      )
      return true
    },

    of(userId: number): Record<string, number> {
      const rows = db
        .query<{ uid: string; slug: string | null; stars: number }, [number]>(
          `select p.uid, p.slug, r.stars from ratings r
             join patches p on p.id = r.patch_id
            where r.user_id = ?`,
        )
        .all(userId)
      return Object.fromEntries(rows.map((row) => [row.slug ?? row.uid, row.stars]))
    },
  }
}

export type Ratings = ReturnType<typeof createRatings>
