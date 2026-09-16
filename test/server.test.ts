import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApi } from '../server/api.ts'
import { authConfigFromEnv } from '../server/identity.ts'
import { limitsFromEnv } from '../server/limits.ts'
import { backupTo, openDatabase } from '../server/db.ts'
import { syncInstruments } from '../server/factory.ts'
import { createStore, isSafeName } from '../server/store.ts'
import { ensureLocalUser } from '../server/users.ts'
import { createPatch, type Patch } from '../src/patch/schema.ts'
import { fixedIdentity } from './fixtures.ts'

/* The request handler and the store beneath it, driven directly: malformed and
   hostile input, and the answers a client depends on telling apart. */

const roots: string[] = []

function freshDb() {
  const root = mkdtempSync(join(tmpdir(), 'moog-server-'))
  roots.push(root)
  const db = openDatabase(join(root, 'moog.db'))
  syncInstruments(db)
  return db
}

/* Writing straight to the store skips the route that resolves a viewer, so
   these supply the owner the route would have. */
const owned = (db: ReturnType<typeof freshDb>) => ensureLocalUser(db, 'local').id

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/* The prefix becomes the id, so it has to be one word. */
const aPatch = (name: string): Patch =>
  createPatch({ name }, fixedIdentity(name.toLowerCase().replace(/[^a-z0-9]+/g, '-')))

describe('an id arriving from a URL', () => {
  test('accepts what an id and a slug actually look like', () => {
    for (const name of ['abc', 'A-1', 'sub_bass', '60s-space', '0']) {
      expect(isSafeName(name)).toBe(true)
    }
  })

  test('refuses anything that is not one word', () => {
    for (const name of ['..', '../x', 'a/b', 'a\\b', '.hidden', 'a.json', '', ' ', 'a b']) {
      expect(isSafeName(name)).toBe(false)
    }
  })

  test('refuses one too long to be a name', () => {
    expect(isSafeName('a'.repeat(128))).toBe(true)
    expect(isSafeName('a'.repeat(129))).toBe(false)
  })

  test('is refused by the store before it reaches a statement', () => {
    const db = freshDb()
    const store = createStore(db)
    expect(store.getPatch('../escape')).toBeNull()
    expect(() => store.putPatch('../escape', aPatch('X'), owned(db))).toThrow(/Unsafe/)
    expect(() => store.deletePatch('../escape')).toThrow(/Unsafe/)
  })
})

describe('writing a patch', () => {
  test('twice at once leaves one row, not two', () => {
    const db = freshDb()
    const store = createStore(db)
    const owner = owned(db)
    const patch = aPatch('Contended')
    for (let i = 0; i < 25; i++) store.putPatch(patch.id, { ...patch, name: `Take ${i}` }, owner)

    const all = store.listPatches(owner)
    expect(all).toHaveLength(1)
    expect(all[0]!.name).toBe('Take 24')
  })

  test('for an instrument nothing knows is refused, not filed under the default', () => {
    const db = freshDb()
    const store = createStore(db)
    expect(() =>
      store.putPatch('x1', { ...aPatch('Alien'), instrument: 'prophet-5' }, owned(db)),
    ).toThrow(/Unknown instrument/)
  })

  test('keeps a control id this build has never heard of', () => {
    /* The format's promise: an older build must not strip a newer one's data. */
    const db = freshDb()
    const store = createStore(db)
    const patch = { ...aPatch('Future'), values: { osc1Volume: 5, fromLater: 'kept' } }
    store.putPatch(patch.id, patch, owned(db))
    expect(store.getPatch(patch.id)?.values).toEqual({ osc1Volume: 5, fromLater: 'kept' })
  })

  test('a deleted patch is gone from every listing but still a row', () => {
    /* Soft, so a copy or a rating that points at it still has something to
       point at. */
    const db = freshDb()
    const store = createStore(db)
    const owner = owned(db)
    const patch = aPatch('Gone')
    store.putPatch(patch.id, patch, owner)
    store.deletePatch(patch.id)

    expect(store.listPatches(owner)).toEqual([])
    expect(store.getPatch(patch.id)).toBeNull()
    expect(db.query<{ n: number }, []>(`select count(*) as n from patches`).get()?.n).toBe(1)
  })
})

describe('the request handler', () => {
  const call = (
    handle: (request: Request) => Promise<Response | null>,
    method: string,
    path: string,
    payload?: unknown,
  ) =>
    handle(
      new Request(`http://test${path}`, {
        method,
        ...(payload === undefined
          ? {}
          : { body: typeof payload === 'string' ? payload : JSON.stringify(payload) }),
      }),
    )

  /* From an empty environment rather than process.env — see apiFixture.ts. */
  const api = () =>
    createApi({ db: freshDb(), config: authConfigFromEnv({}), limits: limitsFromEnv({}) })

  test('leaves anything that is not the API alone', async () => {
    /* Null rather than a 404, so the caller can serve the app. */
    const handle = api()
    expect(await call(handle, 'GET', '/')).toBeNull()
    expect(await call(handle, 'GET', '/index.html')).toBeNull()
    expect(await call(handle, 'GET', '/apiary')).toBeNull()
  })

  test('answers 404 for a resource it does not have', async () => {
    const handle = api()
    expect((await call(handle, 'GET', '/api/'))!.status).toBe(404)
    expect((await call(handle, 'GET', '/api/sounds'))!.status).toBe(404)
  })

  test('health asks the database a real question', async () => {
    const response = (await call(api(), 'GET', '/api/health'))!
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, patches: 0 })
  })

  test('round-trips a patch', async () => {
    const handle = api()
    const created = (await call(handle, 'POST', '/api/patches', aPatch('One')))!
    expect(created.status).toBe(201)
    const { id } = (await created.json()) as { id: string }

    const got = (await call(handle, 'GET', `/api/patches/${id}`))!
    expect(await got.json()).toMatchObject({ name: 'One' })

    expect((await call(handle, 'DELETE', `/api/patches/${id}`))!.status).toBe(200)
    expect((await call(handle, 'GET', `/api/patches/${id}`))!.status).toBe(404)
  })

  test('deleting something that is not there is a 404', async () => {
    expect((await call(api(), 'DELETE', '/api/patches/ghost'))!.status).toBe(404)
  })

  test('refuses a body that is not a patch rather than storing it', async () => {
    /* The columns are typed now, so anything that is not a patch has to be
       refused before it becomes a row. */
    const handle = api()
    expect((await call(handle, 'POST', '/api/patches', 'not json at all'))!.status).toBe(400)
    expect((await call(handle, 'POST', '/api/patches', { notes: 'half a patch' }))!.status).toBe(
      400,
    )
    expect(await (await call(handle, 'GET', '/api/patches'))!.json()).toEqual([])
  })

  test('refuses a patch from a newer build instead of downgrading it', async () => {
    const handle = api()
    const response = (await call(handle, 'POST', '/api/patches', {
      ...aPatch('From The Future'),
      schemaVersion: 99,
    }))!
    expect(response.status).toBe(400)
    expect((await response.json()).error).toMatch(/Update the app/)
  })

  test('refuses a name that could not be a name', async () => {
    const handle = api()
    expect((await call(handle, 'PUT', '/api/patches/..%2F..%2Fescape', aPatch('X')))!.status).toBe(
      400,
    )
  })

  test('says which methods a route has', async () => {
    const handle = api()
    expect((await call(handle, 'DELETE', '/api/patches'))!.status).toBe(405)
    expect((await call(handle, 'POST', '/api/presets'))!.status).toBe(403)
  })

  test('reports a storage failure as one, with a reason', async () => {
    const db = freshDb()
    const handle = createApi({ db, config: authConfigFromEnv({}), limits: limitsFromEnv({}) })
    db.close()

    const response = (await call(handle, 'POST', '/api/patches', aPatch('One')))!
    expect(response.status).toBe(500)
    expect((await response.json()).error).toBeTruthy()
  })
})

describe('the daily backup', () => {
  test('replaces the copy already made today rather than failing', () => {
    const root = mkdtempSync(join(tmpdir(), 'moog-backup-'))
    roots.push(root)
    const db = openDatabase(join(root, 'moog.db'))
    syncInstruments(db)
    const path = join(root, 'backups', 'moog-today.db')

    backupTo(db, path)
    createStore(db).createPatch(aPatch('Saved After The First Copy'), owned(db), 'later')

    /* A restart on the same day used to die here, and the container came back
       up into the same failure. */
    backupTo(db, path)

    const copy = openDatabase(path)
    expect(copy.query(`select count(*) as n from patches`).get()).toEqual({ n: 1 })
    copy.close()
    expect(existsSync(`${path}.partial`)).toBe(false)
  })
})
