import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApi } from '@server/api.ts'
import { openDatabase } from '@server/db.ts'
import { syncInstruments } from '@server/factory.ts'
import { authConfigFromEnv, sessionCookie } from '@server/identity.ts'
import { createRepositories } from '@server/repositories/index.ts'
import { createUsers } from '@server/repositories/users.ts'
import { createPatch, type Patch } from '@patch/schema.ts'
import { fixedIdentity } from './fixtures.ts'

/* Every write now goes through a viewer, while there is still only one of them
   to be. What these pin is that the seam is real — a patch has an owner, a
   rating belongs to whoever gave it — so that switching sign-in on later
   changes who the viewer is and nothing else. */

const roots: string[] = []
const SECRET = 'test-secret'

function server(mode: 'off' | 'oauth' = 'off') {
  const root = mkdtempSync(join(tmpdir(), 'patchmemory-viewer-'))
  roots.push(root)
  const db = openDatabase(join(root, 'patchmemory.db'))
  syncInstruments(db)

  const config = { ...authConfigFromEnv({ PM_SESSION_SECRET: SECRET }), mode, secret: SECRET }
  const handle = createApi({ db, config })

  const call = (method: string, path: string, payload?: unknown, cookie?: string) =>
    handle(
      new Request(`http://test${path}`, {
        method,
        headers: cookie ? { cookie } : undefined,
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      }),
    )

  return { db, config, call, store: createRepositories(db) }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const aPatch = (name: string): Patch => createPatch({ name }, fixedIdentity(name.toLowerCase()))

describe('the session route', () => {
  test('says who the viewer is without ever refusing', async () => {
    const { call } = server()
    const response = (await call('GET', '/api/session'))!
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ mode: 'off', signedIn: true })
  })

  test('says nobody is signed in once sign-in is switched on', async () => {
    const { call } = server('oauth')
    const response = (await call('GET', '/api/session'))!
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ mode: 'oauth', signedIn: false, user: null })
  })

  test('names whoever the cookie carries', async () => {
    const { db, config, call } = server('oauth')
    createUsers(db).ensure({
      uid: 'google-abc',
      provider: 'google',
      subject: 'abc',
      email: 'p@example.com',
      displayName: 'Peter',
    })
    const cookie = (await sessionCookie('google-abc', config, new Request('https://x/'), Date.now()))
      .split(';')[0]!

    const response = (await call('GET', '/api/session', undefined, cookie))!
    expect(await response.json()).toMatchObject({
      signedIn: true,
      user: { uid: 'google-abc', name: 'Peter' },
    })
  })

  test('a cookie naming nobody is nobody, not an error', async () => {
    const { config, call } = server('oauth')
    const cookie = (await sessionCookie('google-never', config, new Request('https://x/'), Date.now()))
      .split(';')[0]!
    expect(await (await call('GET', '/api/session', undefined, cookie))!.json()).toMatchObject({
      signedIn: false,
    })
  })
})

describe('a saved patch has an owner', () => {
  test('from the first write', async () => {
    const { db, call } = server()
    const created = (await call('POST', '/api/patches', aPatch('Mine')))!
    expect(created.status).toBe(201)
    const patch = (await created.json()) as Patch

    const row = db
      .query<{ owner: string | null }, [string]>(
        `select u.uid as owner from patches p join users u on u.id = p.owner_id where p.uid = ?`,
      )
      .get(patch.id)
    expect(row?.owner).toBe('local')
  })

  test('and cannot be saved by nobody', async () => {
    const { call } = server('oauth')
    expect((await call('POST', '/api/patches', aPatch('Theirs')))!.status).toBe(401)
  })
})

describe('a rating belongs to whoever gave it', () => {
  test('and is written without touching the patch', async () => {
    const { db, call, store } = server()
    const patch = (await (await call('POST', '/api/patches', aPatch('Rated')))!.json()) as Patch
    const before = store.patches.get(patch.id)!

    expect((await call('PUT', `/api/patches/${patch.id}/rating`, { stars: 4 }))!.status).toBe(200)

    expect(store.patches.get(patch.id)).toEqual(before)
    const stars = db
      .query<{ stars: number }, []>(`select stars from ratings`)
      .get()
    expect(stars?.stars).toBe(4)
  })

  test('two people rating the same patch do not overwrite each other', () => {
    const { db, store } = server()
    const patch = aPatch('Shared')
    const one = createUsers(db).ensure({ uid: 'u1', provider: 'test', subject: '1' })
    const two = createUsers(db).ensure({ uid: 'u2', provider: 'test', subject: '2' })
    store.patches.put(patch.id, patch, one.id)

    store.ratings.set(one.id, patch.id, 5)
    store.ratings.set(two.id, patch.id, 2)

    expect(store.ratings.of(one.id)).toEqual({ [patch.id]: 5 })
    expect(store.ratings.of(two.id)).toEqual({ [patch.id]: 2 })
  })

  test('zero stars means unrated, so the rating goes away', () => {
    const { db, store } = server()
    const patch = aPatch('Unrated')
    const user = createUsers(db).ensure({ uid: 'u1', provider: 'test', subject: '1' })
    store.patches.put(patch.id, patch, user.id)

    store.ratings.set(user.id, patch.id, 3)
    store.ratings.set(user.id, patch.id, 0)
    expect(store.ratings.of(user.id)).toEqual({})
  })

  test('a factory patch is rated by its slug', () => {
    const { db, store } = server()
    const user = createUsers(db).ensure({ uid: 'u1', provider: 'test', subject: '1' })
    store.patches.putFactory('sub-bass', { ...aPatch('Sub Bass'), visibility: 'public' })

    store.ratings.set(user.id, 'sub-bass', 5)
    expect(store.ratings.of(user.id)).toEqual({ 'sub-bass': 5 })
  })

  test('and may be given in half stars', async () => {
    const { db, call } = server()
    const patch = (await (await call('POST', '/api/patches', aPatch('Rated')))!.json()) as Patch

    expect((await call('PUT', `/api/patches/${patch.id}/rating`, { stars: 3.5 }))!.status).toBe(200)
    expect(db.query<{ stars: number }, []>(`select stars from ratings`).get()?.stars).toBe(3.5)
  })

  test('anything off the half step is refused', async () => {
    const { call } = server()
    const patch = (await (await call('POST', '/api/patches', aPatch('Rated')))!.json()) as Patch

    for (const stars of [-1, 6, 2.25, 0.3, 5.5, 'five', null]) {
      expect((await call('PUT', `/api/patches/${patch.id}/rating`, { stars }))!.status).toBe(400)
    }
  })

  test('rating something that is not there is a 404, not a failure', async () => {
    const { call } = server()
    expect((await call('PUT', '/api/patches/ghost/rating', { stars: 3 }))!.status).toBe(404)
  })
})

describe('settings belong to the viewer', () => {
  test('and round-trip', async () => {
    const { call } = server()
    expect(await (await call('GET', '/api/settings'))!.json()).toEqual({})

    await call('PUT', '/api/settings', { lastPatch: 'abc', sort: 'name' })
    expect(await (await call('GET', '/api/settings'))!.json()).toEqual({
      lastPatch: 'abc',
      sort: 'name',
    })
  })

  test('are refused to nobody', async () => {
    const { call } = server('oauth')
    expect((await call('GET', '/api/settings'))!.status).toBe(401)
    expect((await call('PUT', '/api/settings', {}))!.status).toBe(401)
  })
})
