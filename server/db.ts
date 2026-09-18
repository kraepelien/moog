import { Database } from 'bun:sqlite'
import { mkdirSync, renameSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'

/* One file, opened once. `bun:sqlite` is part of the runtime, so this costs no
   dependency — which is most of why the patches stopped being one file each. */

/* Keyed by the version it upgrades FROM, like the patch migrations, and for the
   same reason: a database on disk keeps the version it was written with.

   There is one step, and it is the whole schema. Nothing is deployed against a
   database anybody would mind losing, so a column added or withdrawn is edited
   into the step that makes its table and the database recreated — a second step
   correcting the first buys nothing and is here for ever. The array and
   `meta.db_version` stay: the day something real is running against data that
   has to survive is the day a step becomes append-only, and that day should
   need no rewiring. */
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
        roles text not null default '',
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

      /* Half stars, and the constraint lists them rather than testing a
         remainder: 0.5 has no exact double in binary, so a check written as
         stars * 2 = cast(stars * 2 as int) would turn on how SQLite rounds. */
      create table ratings (
        user_id integer not null references users(id) on delete cascade,
        patch_id integer not null references patches(id) on delete cascade,
        stars real not null check (stars in (0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5)),
        updated_at text not null,
        primary key (user_id, patch_id)
      );

      create table settings (
        user_id integer primary key references users(id) on delete cascade,
        json text not null
      );

      /* The colour an administrator picks is on the tag rather than in a
         settings blob because it belongs to the row: deleting the tag takes it
         with it, where a blob would keep a colour for a name nothing wears.
         Null is the normal state and means the hash picks. */
      create table tags (
        id integer primary key,
        name text not null unique,
        colour text,
        created_at text not null
      );

      /* A MIDI file with a sound on each of its parts. The file is stored whole
         because it is what was uploaded and nothing here can reconstruct it, but
         the sounds are stored as patch *ids*: a part points at a patch rather
         than copying it, so editing a patch changes what the arrangement plays
         and deleting one leaves a part silent rather than a stale copy that
         nothing can find its way back from. */
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

      /* One person's answer for one privilege, beating whatever their roles
         give. A table rather than a column on users: this is a per-(user,
         privilege) decision with two states, which is the shape ratings
         already has, and it lets one row be written without sending the rest
         back — a whole-set write would delete any row naming a privilege the
         writing build does not know. */
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
