import type { Database } from 'bun:sqlite'
import { DEFAULT_INSTRUMENT } from '../../src/instruments/instruments.ts'
import { PATCH_SCHEMA_VERSION, type Patch } from '../../src/patch/schema.ts'

/* Patches and factory presets are rows in one table, told apart by whether they
   came from the repo — a factory row is the one with a slug. Everything the
   library will ask — whose is this, who may see it, what is it rated — is a
   column or a join, which a folder of JSON files could not answer without
   reading all of them.

   Rows in, rows out. Who may see one is the patches service's question, not
   this file's: a repository that also refused would be a second place for the
   rules to live. */

/* An id still reaches the API from a URL, so it is still pattern-checked. It no
   longer becomes a filename, but a parameter that cannot be a word is one fewer
   thing to reason about. */
const SAFE_NAME = /^[A-Za-z0-9_-]+$/

export function isSafeName(name: string): boolean {
  return SAFE_NAME.test(name) && name.length <= 128
}

/* Everything a caller needs to decide whether the viewer may do this, in one
   question: who owns it, whether it came from the repo, and who may see it. */
export interface Located {
  readonly uid: string
  readonly slug: string | null
  readonly ownerId: number | null
  readonly ownerUid: string | null
  readonly ownerName: string | null
  readonly visibility: string
  readonly name: string
  readonly deletedAt: string | null
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

export function createPatches(db: Database) {
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
    listOwnedBy(owner: number): Patch[] {
      return db
        .query<PatchRow, [number]>(
          `${SELECT} and p.slug is null and p.owner_id = ? order by p.updated_at desc`,
        )
        .all(owner)
        .map(toPatch)
    },

    get(id: string): Patch | null {
      if (!isSafeName(id)) return null
      const row = db.query<PatchRow, [string]>(`${SELECT} and p.uid = ?`).get(id)
      return row ? toPatch(row) : null
    },

    put(id: string, patch: Patch, owner: number): void {
      if (!isSafeName(id)) throw new Error(`Unsafe patch id: ${id}`)
      write({ ...patch, id }, { owner })
    },

    locate(id: string): Located | null {
      if (!isSafeName(id)) return null
      return (
        db
          .query<Located, [string, string]>(
            `select p.uid, p.slug, p.owner_id as ownerId, p.visibility, p.name,
                    u.uid as ownerUid, u.display_name as ownerName,
                    p.deleted_at as deletedAt
               from patches p
               left join users u on u.id = p.owner_id
              where p.uid = ? or p.slug = ?`,
          )
          .get(id, id) ?? null
      )
    },

    /* The only way a patch is created: the server mints the id, so a client
       cannot choose one that collides or resurrect something it deleted. */
    create(patch: Patch, owner: number, id: string): Patch {
      write({ ...patch, id }, { owner })
      return { ...patch, id }
    },

    restore(id: string): boolean {
      if (!isSafeName(id)) return false
      return db.run(`update patches set deleted_at = null where uid = ?`, [id]).changes > 0
    },

    /* Everything the viewer may see: their own, anything public, and the bank. */
    listVisible(viewerId: number | null): Patch[] {
      return db
        .query<PatchRow, [number | null]>(
          `${SELECT} and (p.slug is not null or p.visibility = 'public' or p.owner_id = ?)
            order by p.updated_at desc`,
        )
        .all(viewerId)
        .map(toPatch)
    },

    delete(id: string): void {
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
      db.run(`update patches set deleted_at = ? where slug = ?`, [new Date().toISOString(), slug])
    },

    countOwnedBy(owner: number): number {
      return (
        db
          .query<{ n: number }, [number]>(
            `select count(*) as n from patches where owner_id = ? and deleted_at is null`,
          )
          .get(owner)?.n ?? 0
      )
    },

    /* Trash older than the app keeps it. Deleted for real here, which is what
       makes the soft delete a grace period rather than a leak. */
    purgeTrash(before: string): number {
      return db.run(`delete from patches where deleted_at is not null and deleted_at < ?`, [before])
        .changes
    },

    setVisibility(id: string, visibility: 'private' | 'public'): void {
      db.run(`update patches set visibility = ? where uid = ?`, [visibility, id])
    },

    /* The healthcheck asks a real question, so an unmounted volume fails it. */
    count(): number {
      return db.query<{ n: number }, []>(`select count(*) as n from patches`).get()?.n ?? 0
    },
  }
}

export type Patches = ReturnType<typeof createPatches>
