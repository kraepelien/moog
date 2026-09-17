import { Database } from 'bun:sqlite'
import { mkdirSync, renameSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'

/* One file, opened once. `bun:sqlite` is part of the runtime, so this costs no
   dependency — which is most of why the patches stopped being one file each. */

/* Keyed by the version it upgrades FROM, like the patch migrations, and for the
   same reason: a database on disk keeps the version it was written with. */
type Step = (db: Database) => void

const SCHEMA: Step[] = [
  (db) => {
    db.run(`
      create table instruments (
        id integer primary key,
        slug text not null unique,
        name text not null
      );

      create table users (
        id integer primary key,
        uid text not null unique,
        provider text not null,
        subject text not null,
        email text,
        display_name text,
        avatar_url text,
        created_at text not null,
        last_seen_at text not null,
        unique (provider, subject)
      );

      create table patches (
        id integer primary key,
        uid text not null unique,
        slug text unique,
        owner_id integer references users(id) on delete cascade,
        instrument_id integer not null references instruments(id),
        name text not null,
        notes text not null default '',
        tags text not null default '[]',
        visibility text not null check (visibility in ('private', 'public')),
        approximate integer not null default 0,
        derived_from text,
        schema_version integer not null,
        values_json text not null,
        created_at text not null,
        updated_at text not null,
        deleted_at text
      );
      create index patches_owner on patches (owner_id);
      create index patches_instrument on patches (instrument_id);

      create table ratings (
        user_id integer not null references users(id) on delete cascade,
        patch_id integer not null references patches(id) on delete cascade,
        stars integer not null check (stars between 1 and 5),
        updated_at text not null,
        primary key (user_id, patch_id)
      );

      create table settings (
        user_id integer primary key references users(id) on delete cascade,
        json text not null
      );

      create table tags (
        id integer primary key,
        name text not null unique,
        created_at text not null
      );
    `)
  },

  /* Half stars. SQLite cannot loosen a check constraint in place, so the table
     is rebuilt; the whole numbers already given carry over unchanged, a rating
     of 4 being the same rating either way. The constraint lists the steps rather
     than testing a remainder, because 0.5 has no exact double in binary and
     `stars * 2 = cast(stars * 2 as int)` would turn on how SQLite rounds. */
  (db) => {
    db.run(`
      create table ratings_half (
        user_id integer not null references users(id) on delete cascade,
        patch_id integer not null references patches(id) on delete cascade,
        stars real not null check (stars in (0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5)),
        updated_at text not null,
        primary key (user_id, patch_id)
      );
      insert into ratings_half (user_id, patch_id, stars, updated_at)
        select user_id, patch_id, stars, updated_at from ratings;
      drop table ratings;
      alter table ratings_half rename to ratings;
    `)
  },

  (db) => {
    db.run(`alter table users add column roles text not null default ''`)

    /* Backfilled to what the build before this one already did, so switching
       over changes nobody's access. Everybody who could sign in was a member in
       all but name; the local user is the one the `off` mode handed admin to
       unconditionally, and it keeps it by holding the role rather than by the
       checker making an exception. */
    db.run(`update users set roles = 'member'`)
    db.run(`update users set roles = 'admin,member' where provider = 'local'`)
  },
]

export const DB_VERSION = SCHEMA.length

function currentVersion(db: Database): number {
  db.run(`create table if not exists meta (key text primary key, value text not null)`)
  const row = db.query<{ value: string }, []>(`select value from meta where key = 'db_version'`).get()
  return row ? Number(row.value) : 0
}

export function openDatabase(path: string): Database {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path, { create: true })

  /* WAL so a reader never blocks on the writer, and a busy timeout so two
     processes during a deploy wait rather than fail. Foreign keys are off by
     default in SQLite, which would make every `references` above decorative. */
  db.run('pragma journal_mode = wal')
  db.run('pragma foreign_keys = on')
  db.run('pragma busy_timeout = 5000')

  const from = currentVersion(db)
  if (from < DB_VERSION) {
    db.transaction(() => {
      for (let version = from; version < DB_VERSION; version++) SCHEMA[version]!(db)
      db.run(`insert into meta (key, value) values ('db_version', ?)
              on conflict(key) do update set value = excluded.value`, [String(DB_VERSION)])
    })()
  }

  return db
}

/* A consistent copy while the server is running: a plain file copy of a
   database in WAL mode can catch it mid-write. */
export function backupTo(db: Database, path: string): void {
  mkdirSync(dirname(path), { recursive: true })

  /* `vacuum into` refuses an existing file, and the day's copy is already there
     on every restart after the first — so it is written beside and moved over,
     which also means a failed copy never replaces a good one. */
  const partial = `${path}.partial`
  rmSync(partial, { force: true })
  db.run(`vacuum into ?`, [partial])
  renameSync(partial, path)
}
