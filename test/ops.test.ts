import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApi } from '@server/api.ts'
import { openDatabase } from '@server/db.ts'
import { syncInstruments } from '@server/factory.ts'
import { authConfigFromEnv } from '@server/identity.ts'
import { limitsFromEnv } from '@server/limits.ts'
import { createOpsLog, runMaintenance } from '@server/ops.ts'
import { createPatches } from '@server/repositories/patches.ts'
import { createUsers } from '@server/repositories/users.ts'
import { createPatch } from '@patch/schema.ts'

/* The housekeeping, and the record of it the operations page reads.

   Nothing here calls `scheduleMaintenance`: it starts a real `setInterval`, and
   a suite holding one open never exits. One cycle is `runMaintenance`, which is
   why the two are separate exports. */

const roots: string[] = []

function world(env: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'moog-ops-'))
  roots.push(root)
  const databasePath = join(root, 'moog.db')
  const db = openDatabase(databasePath)
  syncInstruments(db)
  const limits = limitsFromEnv(env)
  const ops = createOpsLog({ databasePath })
  const patches = createPatches(db)
  return { root, db, limits, ops, patches, databasePath }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('what a process that runs no housekeeping says', () => {
  /* The dev plugin's whole situation: it serves the same routes and starts no
     timer. A zero would read as a backup that ran and copied nothing. */
  test('says nothing is scheduled rather than reporting a backup of none', () => {
    const { ops, limits } = world()
    const report = ops.report(limits)

    expect(report.scheduled).toBe(false)
    expect(report.backup).toBeNull()
    expect(report.purge).toBeNull()
  })

  test('still knows the bank it seeded, which both entry points do', () => {
    const { ops, limits } = world()
    ops.recordFactory({ loaded: 44, kept: 0, retired: 0, refreshed: false })

    expect(ops.report(limits).factory).toMatchObject({ loaded: 44, kept: 0 })
  })
})

describe('one cycle of the housekeeping', () => {
  test('writes a dated copy and records where it went', () => {
    const world_ = world()
    runMaintenance(world_)

    const run = world_.ops.report(world_.limits).backup!
    expect(run.ok).toBe(true)
    expect(run.error).toBeNull()
    expect(existsSync(run.path)).toBe(true)
  })

  /* The reason the try/catch is there: a container that exited on a failed
     backup would be restarted into the same failure. The record is what stops
     it also being invisible. */
  test('records a backup that threw, and does not throw itself', () => {
    const world_ = world()
    const failing = () => {
      throw new Error('read-only file system')
    }

    expect(() => runMaintenance({ ...world_, backup: failing })).not.toThrow()

    const run = world_.ops.report(world_.limits).backup!
    expect(run.ok).toBe(false)
    expect(run.error).toContain('read-only file system')
  })

  test('sweeps what is past the window and leaves what is inside it', () => {
    const world_ = world({ MOOG_TRASH_DAYS: '3' })
    /* A real row: patches carry a foreign key to their owner. */
    const owner = createUsers(world_.db).ensure({
      uid: 'me',
      provider: 'test',
      subject: 'me',
      displayName: 'Me',
    }).id
    const old = createPatch({ name: 'Long gone' })
    const fresh = createPatch({ name: 'Just deleted' })
    world_.patches.put(old.id, old, owner)
    world_.patches.put(fresh.id, fresh, owner)
    world_.db.run(`update patches set deleted_at = ? where uid = ?`, [
      '2020-01-01T00:00:00.000Z',
      old.id,
    ])
    world_.db.run(`update patches set deleted_at = ? where uid = ?`, [
      new Date().toISOString(),
      fresh.id,
    ])

    runMaintenance(world_)

    const run = world_.ops.report(world_.limits).purge!
    expect(run.removed).toBe(1)
    expect(world_.patches.locate(fresh.id)).not.toBeNull()
  })

  test('says which cutoff the count was taken against', () => {
    const world_ = world({ MOOG_TRASH_DAYS: '3' })
    runMaintenance({ ...world_, now: () => Date.parse('2026-01-10T00:00:00.000Z') })

    expect(world_.ops.report(world_.limits).purge!.olderThan).toBe('2026-01-07T00:00:00.000Z')
  })
})

describe('the report itself', () => {
  test('names the variable that sets each limit, so a reader knows what to change', () => {
    const { ops, limits } = world()
    const report = ops.report(limits)

    expect(report.limitEnv.trashDays).toBe('MOOG_TRASH_DAYS')
    expect(Object.keys(report.limitEnv).sort()).toEqual(Object.keys(report.limits).sort())
  })

  /* The write-ahead log counts: in WAL mode the main file stays tiny until a
     checkpoint, and a fresh install reported 4 KiB while its own backup was
     139 KB, which makes a reader doubt the page rather than the number. */
  test('measures the database and the log beside it', () => {
    const world_ = world()
    const owner = createUsers(world_.db).ensure({
      uid: 'me',
      provider: 'test',
      subject: 'me',
      displayName: 'Me',
    }).id
    for (let n = 0; n < 40; n++) {
      const made = createPatch({ name: `Patch ${n}` })
      world_.patches.put(made.id, made, owner)
    }

    const report = world_.ops.report(world_.limits)
    expect(report.database.path).toBe(world_.databasePath)
    /* More than the main file alone, which is still one page at this point. */
    expect(report.database.bytes).toBeGreaterThan(4096)
  })

  /* The API is handed a database handle and never a path, so a log built
     without one says so rather than guessing at a file. */
  test('says so when nothing told it where the database is', () => {
    const { limits } = world()
    const report = createOpsLog().report(limits)

    expect(report.database.path).toBeNull()
    expect(report.database.bytes).toBeNull()
  })
})

/* Sign-in on, so there is somebody to refuse. The secret is required once a
   client id is set, which is a startup check rather than anything about ops. */
const SIGNED_OUT = {
  MOOG_OAUTH_CLIENT_ID: 'x',
  MOOG_OAUTH_CLIENT_SECRET: 'y',
  MOOG_SESSION_SECRET: 'z'.repeat(32),
}

describe('who may read it', () => {
  function server(env: Record<string, string> = {}) {
    const { db, ops } = world()
    const handle = createApi({
      db,
      config: authConfigFromEnv(env),
      limits: limitsFromEnv({}),
      ops,
    })
    return (method: string, path: string) =>
      handle(new Request(`http://test${path}`, { method }))
  }

  /* With sign-in off there is one local user and the mode is what makes them an
     administrator, so this is the holding case rather than the refusing one. */
  test('answers an administrator', async () => {
    const response = await server()('GET', '/api/ops')
    expect(response!.status).toBe(200)
  })

  test('refuses somebody with nobody signed in', async () => {
    const response = await server(SIGNED_OUT)(
      'GET',
      '/api/ops',
    )
    expect(response!.status).toBe(401)
  })

  /* Not folded into /health, which is open because the container's healthcheck
     calls it with no session. */
  test('is not something the open healthcheck gives away', async () => {
    const response = await server(SIGNED_OUT)(
      'GET',
      '/api/health',
    )
    expect(response!.status).toBe(200)
    expect(await response!.text()).not.toContain('MOOG_TRASH_DAYS')
  })
})
