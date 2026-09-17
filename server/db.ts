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

  /* A MIDI file with a sound on each of its parts. The file is stored whole
     because it is what was uploaded and nothing here can reconstruct it, but
     the sounds are stored as patch *ids*: a part points at a patch rather than
     copying it, so editing a patch changes what the arrangement plays and
     deleting one leaves a part silent rather than leaving a stale copy that
     nothing can find its way back from. */
  (db) => {
    db.run(`
      create table arrangements (
        id integer primary key,
        uid text not null unique,
        owner_id integer not null references users(id) on delete cascade,
        name text not null,
        file_name text not null,
        midi blob not null,
        bpm text not null,
        parts text not null default '{}',
        soloed text not null default '[]',
        muted text not null default '[]',
        created_at text not null,
        updated_at text not null
      );
      create index arrangements_owner on arrangements (owner_id);
    `)
  },

  /* One person's answer for one privilege, beating whatever their roles give.
     A table rather than a column on `users`: this is a per-(user, privilege)
     decision with two states, which is the shape `ratings` already has, and it
     lets one row be written without sending the rest back — a whole-set write
     would delete any row naming a privilege the writing build does not know. */
  (db) => {
    db.run(`
      create table user_privileges (
        user_id    integer not null references users(id) on delete cascade,
        privilege  text not null,
        granted    integer not null check (granted in (0, 1)),
        at         text not null,
        by_user_id integer references users(id) on delete set null,
        primary key (user_id, privilege)
      );
    `)
  },

  /* `member` is applied to everyone at resolution now, so storing it says
     nothing. Left in the column it would show in the admin page for accounts
     written before this and not for accounts written after, which reads as two
     kinds of member. Written in TypeScript rather than SQL because the column
     is a comma-separated set and the orderings are not worth enumerating. */
  (db) => {
    const rows = db.query<{ id: number; roles: string }, []>(`select id, roles from users`).all()
    const update = db.prepare(`update users set roles = ? where id = ?`)
    for (const row of rows) {
      const kept = row.roles
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name !== '' && name !== 'member')
      if (kept.length !== row.roles.split(',').filter(Boolean).length) {
        update.run(kept.join(','), row.id)
      }
    }
  },

  /* `admin` now comes from MOOG_ADMINS and nowhere else, so a stored one is a
     second source for a fact that has one. Resolution already ignores it; this
     takes it out of the column too, so the admin page stops showing a role
     nobody is being given. `tester` is the only thing left that is. */
  (db) => {
    const rows = db.query<{ id: number; roles: string }, []>(`select id, roles from users`).all()
    const update = db.prepare(`update users set roles = ? where id = ?`)
    for (const row of rows) {
      const kept = row.roles
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name !== '' && name !== 'admin')
      if (kept.length !== row.roles.split(',').filter(Boolean).length) {
        update.run(kept.join(','), row.id)
      }
    }
  },

  /* A colour an administrator picks for a category.

     The colour is on the tag rather than in a settings blob because it belongs
     to the row: deleting the tag takes it with it, where a blob would keep a
     colour for a name nothing wears. Null is the normal state and means the
     hash picks, which is what every tag written before this had.

     `app_settings` is keyed and global, unlike `settings`, which is one row per
     person. It held the app's palette, which is a preview on the device now;
     the table stays because a step is append-only. */
  (db) => {
    db.run(`
      alter table tags add column colour text;

      create table app_settings (
        key text primary key,
        json text not null,
        updated_at text not null
      );
    `)
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
