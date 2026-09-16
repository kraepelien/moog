import type { Database } from 'bun:sqlite'
import { DEFAULT_INSTRUMENT } from '../src/instruments/instruments.ts'
import { PATCH_SCHEMA_VERSION, type Patch } from '../src/patch/schema.ts'

/* Patches and factory presets are rows in one table, told apart by whether they
   came from the repo — a factory row is the one with a slug. Everything the
   library will ask — whose is this, who may see it, what is it rated — is a
   column or a join, which a folder of JSON files could not answer without
   reading all of them.

   A saved patch carries its owner from the first write, though with sign-in
   off there is only ever the one local user to be. */

/* An id still reaches the API from a URL, so it is still pattern-checked. It no
   longer becomes a filename, but a parameter that cannot be a word is one fewer
   thing to reason about. */
const SAFE_NAME = /^[A-Za-z0-9_-]+$/

export function isSafeName(name: string): boolean {
  return SAFE_NAME.test(name) && name.length <= 128
}

interface PatchRow {
  uid: string
  slug: string | null
  name: string
  notes: string
  tags: string
  visibility: string
  approximate: number
  derived_from: string | null
  schema_version: number
  values_json: string
  instrument: string
  created_at: string
  updated_at: string
}

const SELECT = `
  select p.uid, p.slug, p.name, p.notes, p.tags, p.visibility, p.approximate,
         p.derived_from, p.schema_version, p.values_json, i.slug as instrument,
         p.created_at, p.updated_at
    from patches p
    join instruments i on i.id = p.instrument_id
   where p.deleted_at is null`

function toPatch(row: PatchRow): Patch {
  return {
    schemaVersion: row.schema_version,
    id: row.slug ?? row.uid,
    name: row.name,
    notes: row.notes,
    values: JSON.parse(row.values_json),
    tags: JSON.parse(row.tags),
    instrument: row.instrument,
    visibility: row.visibility as Patch['visibility'],
    approximate: row.approximate === 1,
    derivedFrom: row.derived_from === null ? null : JSON.parse(row.derived_from),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function createStore(db: Database) {
  const instrumentId = db.prepare<{ id: number }, [string]>(
    `select id from instruments where slug = ?`,
  )

  /* Named after the id in the patch, not a guess: a patch for an instrument
     this build has never heard of is refused rather than filed under the
     default, where it would draw with the wrong registry. */
  const requireInstrument = (slug: string): number => {
    const row = instrumentId.get(slug)
    if (!row) throw new Error(`Unknown instrument: ${slug}`)
    return row.id
  }

  const upsert = db.prepare(`
    insert into patches (uid, slug, owner_id, instrument_id, name, notes, tags, visibility,
                         approximate, derived_from, schema_version, values_json,
                         created_at, updated_at)
    values ($uid, $slug, $owner, $instrument, $name, $notes, $tags, $visibility,
            $approximate, $derivedFrom, $schemaVersion, $values, $createdAt, $updatedAt)
    on conflict(uid) do update set
      name = excluded.name, notes = excluded.notes, tags = excluded.tags,
      visibility = excluded.visibility, approximate = excluded.approximate,
      derived_from = excluded.derived_from, schema_version = excluded.schema_version,
      values_json = excluded.values_json, instrument_id = excluded.instrument_id,
      updated_at = excluded.updated_at, deleted_at = null`)

  const write = (patch: Patch, options: { slug?: string | null; owner?: number | null } = {}) => {
    upsert.run({
      $uid: patch.id,
      $slug: options.slug ?? null,
      $owner: options.owner ?? null,
      $instrument: requireInstrument(patch.instrument || DEFAULT_INSTRUMENT.id),
      $name: patch.name,
      $notes: patch.notes,
      $tags: JSON.stringify(patch.tags),
      $visibility: patch.visibility,
      $approximate: patch.approximate ? 1 : 0,
      $derivedFrom: patch.derivedFrom === null ? null : JSON.stringify(patch.derivedFrom),
      $schemaVersion: patch.schemaVersion || PATCH_SCHEMA_VERSION,
      $values: JSON.stringify(patch.values),
      $createdAt: patch.createdAt,
      $updatedAt: patch.updatedAt,
    })
  }

  return {
    db,

    listPatches(): Patch[] {
      return db
        .query<PatchRow, []>(`${SELECT} and p.slug is null order by p.updated_at desc`)
        .all()
        .map(toPatch)
    },

    getPatch(id: string): Patch | null {
      if (!isSafeName(id)) return null
      const row = db.query<PatchRow, [string]>(`${SELECT} and p.uid = ?`).get(id)
      return row ? toPatch(row) : null
    },

    putPatch(id: string, patch: Patch, owner: number): void {
      if (!isSafeName(id)) throw new Error(`Unsafe patch id: ${id}`)
      write({ ...patch, id }, { owner })
    },

    deletePatch(id: string): void {
      if (!isSafeName(id)) throw new Error(`Unsafe patch id: ${id}`)
      db.run(`update patches set deleted_at = ? where uid = ?`, [new Date().toISOString(), id])
    },

    /* Addressed by the slug they are filed under in the repo rather than by a
       uid, which would differ between installs of the same bank. */
    listPresets(): Patch[] {
      return db
        .query<PatchRow, []>(`${SELECT} and p.slug is not null order by p.name`)
        .all()
        .map(toPatch)
    },

    putPreset(slug: string, patch: Patch): void {
      if (!isSafeName(slug)) throw new Error(`Unsafe preset slug: ${slug}`)
      const existing = db
        .query<{ uid: string }, [string]>(`select uid from patches where slug = ?`)
        .get(slug)
      write({ ...patch, id: existing?.uid ?? patch.id }, { slug })
    },

    deletePreset(slug: string): void {
      if (!isSafeName(slug)) throw new Error(`Unsafe preset slug: ${slug}`)
      db.run(`update patches set deleted_at = ? where slug = ?`, [
        new Date().toISOString(),
        slug,
      ])
    },

    /* The healthcheck asks a real question, so an unmounted volume fails it. */
    countPatches(): number {
      return db.query<{ n: number }, []>(`select count(*) as n from patches`).get()?.n ?? 0
    },

    /* Stars are the viewer's, never the patch's: two people rating the same
       sound must not overwrite each other, and a rating is not part of what a
       patch is. 0 means unrated, which is a row removed rather than stored. */
    setRating(userId: number, patchUid: string, stars: number): boolean {
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

    ratingsOf(userId: number): Record<string, number> {
      const rows = db
        .query<
          { uid: string; slug: string | null; stars: number },
          [number]
        >(
          `select p.uid, p.slug, r.stars from ratings r
             join patches p on p.id = r.patch_id
            where r.user_id = ?`,
        )
        .all(userId)
      return Object.fromEntries(rows.map((row) => [row.slug ?? row.uid, row.stars]))
    },

    settingsOf(userId: number): unknown {
      const row = db
        .query<{ json: string }, [number]>(`select json from settings where user_id = ?`)
        .get(userId)
      return row ? JSON.parse(row.json) : {}
    },

    putSettings(userId: number, settings: unknown): void {
      db.run(
        `insert into settings (user_id, json) values (?, ?)
         on conflict(user_id) do update set json = excluded.json`,
        [userId, JSON.stringify(settings)],
      )
    },
  }
}

export type Store = ReturnType<typeof createStore>
