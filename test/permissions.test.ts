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
import { copyOf } from '@patch/copy.ts'
import { createPatch, type Patch } from '@patch/schema.ts'

/* Two people and a factory bank. Someone else's private patch answers 404
   rather than 403 throughout: a 403 confirms the id exists. */

const roots: string[] = []
const SECRET = 'permissions-secret'

async function world() {
  const root = mkdtempSync(join(tmpdir(), 'moog-perms-'))
  roots.push(root)
  const db = openDatabase(join(root, 'moog.db'))
  syncInstruments(db)
  const store = createRepositories(db)

  const config = {
    ...authConfigFromEnv({ MOOG_SESSION_SECRET: SECRET }),
    mode: 'oauth' as const,
    secret: SECRET,
    admins: ['boss@example.com'],
  }
  const handle = createApi({ db, config })

  const person = async (uid: string, email: string) => {
    const row = createUsers(db).ensure({ uid, provider: 'test', subject: uid, email, displayName: uid })
    const cookie = (
      await sessionCookie(uid, config, new Request('https://x/'), Date.now())
    ).split(';')[0]!
    return {
      row,
      call: (method: string, path: string, payload?: unknown) =>
        handle(
          new Request(`http://test${path}`, {
            method,
            headers: { cookie },
            ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
          }),
        ),
    }
  }

  const stranger = (method: string, path: string, payload?: unknown) =>
    handle(
      new Request(`http://test${path}`, {
        method,
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      }),
    )

  const mine = await person('u-mine', 'mine@example.com')
  const theirs = await person('u-theirs', 'theirs@example.com')
  const boss = await person('u-boss', 'boss@example.com')

  store.patches.putFactory('sub-bass', {
    ...createPatch({ name: 'Sub Bass', visibility: 'public', approximate: true }),
    id: 'sub-bass',
  })

  const own = async (owner: typeof mine, name: string, visibility: Patch['visibility']) => {
    const response = (await owner.call('POST', '/api/patches', {
      ...createPatch({ name, visibility }),
      id: undefined,
    }))!
    return (await response.json()) as Patch
  }

  return { db, store, mine, theirs, boss, stranger, own }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/* Read through the same route as any other patch, refused on write by the same
   `mayWrite` — there is no second surface for it to be reached through. */
describe('a factory patch', () => {
  test('is readable by anyone signed in', async () => {
    const { mine, theirs } = await world()
    expect((await mine.call('GET', '/api/patches/sub-bass'))!.status).toBe(200)
    expect((await theirs.call('GET', '/api/patches/sub-bass'))!.status).toBe(200)
  })

  test('cannot be written over by somebody without the privilege', async () => {
    const { mine, store } = await world()
    const before = store.patches.listFactory()[0]!

    expect((await mine.call('PUT', '/api/patches/sub-bass', before))!.status).toBe(403)
    expect(store.patches.listFactory()[0]).toEqual(before)
  })

  /* The correction the bank was seeded rather than synced *for*: the rows are
     the live bank, so this survives a restart, where a file put back over a row
     would not. The whole bank was wrong once. */
  test('is corrected by an administrator, and keeps its slug and its bank', async () => {
    const { boss, store } = await world()
    const before = store.patches.listFactory()[0]!

    const response = (await boss.call('PUT', '/api/patches/sub-bass', {
      ...before,
      name: 'Sub Bass, corrected',
      values: { ...before.values, osc1Range: 'ft2' },
    }))!
    expect(response.status).toBe(200)

    const after = store.patches.listFactory()[0]!
    expect(after.name).toBe('Sub Bass, corrected')
    expect(after.values.osc1Range).toBe('ft2')
    /* Still the bank: addressed by its slug, owned by nobody, and listed as a
       factory patch rather than quietly becoming the administrator's. */
    expect(after.id).toBe('sub-bass')
    expect(store.patches.locate('sub-bass')?.ownerId).toBeNull()
  })

  /* Correcting a sheet is not the same act as taking one out of the manual, and
     a retired factory patch stays retired: no file brings it back. */
  test('is still not something an administrator can remove or unpublish', async () => {
    const { boss, store } = await world()
    const before = store.patches.listFactory()[0]!

    expect((await boss.call('DELETE', '/api/patches/sub-bass'))!.status).toBe(403)
    expect((await boss.call('POST', '/api/patches/sub-bass/unpublish'))!.status).toBe(403)

    expect(store.patches.listFactory()[0]).toEqual(before)
  })

  /* Posted the way the editor posts it: the server keeps whatever visibility it
     is sent, and it is `copyOf` that holds a copy back from being published. */
  test('is copied instead, and the copy is mine and private', async () => {
    const { mine, store } = await world()
    const response = (await mine.call('POST', '/api/patches', {
      ...copyOf(store.patches.listFactory()[0]!, { name: 'My Sub Bass', owner: null }),
      from: 'sub-bass',
    }))!
    expect(response.status).toBe(201)

    const copy = (await response.json()) as Patch
    expect(copy.id).not.toBe('sub-bass')
    expect(copy.visibility).toBe('private')
    expect(copy.derivedFrom).toMatchObject({ id: 'sub-bass', name: 'Sub Bass', kind: 'factory' })
    expect(store.patches.locate(copy.id)?.ownerUid).toBe('u-mine')
  })

  test('is never listed as one of my patches', async () => {
    const { mine } = await world()
    expect(await (await mine.call('GET', '/api/patches'))!.json()).toEqual([])
  })
})

describe('a patch of mine', () => {
  test('is mine to write over and to delete', async () => {
    const { mine, own } = await world()
    const patch = await own(mine, 'Mine', 'private')

    expect((await mine.call('PUT', `/api/patches/${patch.id}`, { ...patch, name: 'Renamed' }))!.status).toBe(200)
    expect((await mine.call('DELETE', `/api/patches/${patch.id}`))!.status).toBe(200)
    expect((await mine.call('GET', `/api/patches/${patch.id}`))!.status).toBe(404)
  })

  test('comes back if I deleted it by mistake', async () => {
    const { mine, own } = await world()
    const patch = await own(mine, 'Mine', 'private')
    await mine.call('DELETE', `/api/patches/${patch.id}`)

    expect((await mine.call('POST', `/api/patches/${patch.id}/restore`))!.status).toBe(200)
    expect((await mine.call('GET', `/api/patches/${patch.id}`))!.status).toBe(200)
  })

  test('is invisible to anybody else while it is private', async () => {
    const { mine, theirs, own } = await world()
    const patch = await own(mine, 'Secret', 'private')

    expect((await theirs.call('GET', `/api/patches/${patch.id}`))!.status).toBe(404)
    expect((await theirs.call('PUT', `/api/patches/${patch.id}`, patch))!.status).toBe(404)
    expect((await theirs.call('DELETE', `/api/patches/${patch.id}`))!.status).toBe(404)
  })

  test('is readable but not writable by anybody else once it is public', async () => {
    const { mine, theirs, own, store } = await world()
    const patch = await own(mine, 'Shared', 'public')
    const before = store.patches.get(patch.id)

    expect((await theirs.call('GET', `/api/patches/${patch.id}`))!.status).toBe(200)
    expect((await theirs.call('PUT', `/api/patches/${patch.id}`, { ...patch, name: 'Stolen' }))!.status).toBe(403)
    expect(store.patches.get(patch.id)).toEqual(before)
  })

  test('cannot be handed to somebody else by editing the body', async () => {
    /* The route decides whose it is, not the payload. */
    const { mine, theirs, own, store } = await world()
    const patch = await own(mine, 'Mine', 'private')

    await mine.call('PUT', `/api/patches/${patch.id}`, { ...patch, id: 'something-else' })
    expect(store.patches.locate(patch.id)?.ownerUid).toBe('u-mine')
    expect(await (await theirs.call('GET', '/api/patches'))!.json()).toEqual([])
  })
})

describe('somebody else copying my public patch', () => {
  test('gets their own, recording where it came from and who made it', async () => {
    const { mine, theirs, own, store } = await world()
    const patch = await own(mine, 'Shared', 'public')

    const response = (await theirs.call('POST', '/api/patches', {
      ...createPatch({ name: 'Their Take' }),
      from: patch.id,
    }))!
    const copy = (await response.json()) as Patch

    expect(store.patches.locate(copy.id)?.ownerUid).toBe('u-theirs')
    expect(copy.derivedFrom).toMatchObject({
      id: patch.id,
      name: 'Shared',
      kind: 'user',
      ownerId: 'u-mine',
      ownerName: 'u-mine',
    })
  })

  test('cannot copy one they were never allowed to see', async () => {
    const { mine, theirs, own } = await world()
    const patch = await own(mine, 'Secret', 'private')

    const response = (await theirs.call('POST', '/api/patches', {
      ...createPatch({ name: 'Nice Try' }),
      from: patch.id,
    }))!
    expect(response.status).toBe(404)
  })
})

describe('an admin', () => {
  test('can delete a patch that is not theirs', async () => {
    const { mine, boss, own } = await world()
    const patch = await own(mine, 'Mine', 'public')
    expect((await boss.call('DELETE', `/api/patches/${patch.id}`))!.status).toBe(200)
  })

  test('is only an admin because the env says so', async () => {
    const { theirs, mine, own } = await world()
    const patch = await own(mine, 'Mine', 'public')
    expect((await theirs.call('DELETE', `/api/patches/${patch.id}`))!.status).toBe(403)
  })
})

describe('signed out', () => {
  test('everything but the session and health is refused', async () => {
    const { stranger } = await world()
    expect((await stranger('GET', '/api/patches'))!.status).toBe(401)
    expect((await stranger('GET', '/api/patches/sub-bass'))!.status).toBe(401)
    expect((await stranger('POST', '/api/patches', {}))!.status).toBe(401)
    expect((await stranger('GET', '/api/settings'))!.status).toBe(401)

    expect((await stranger('GET', '/api/session'))!.status).toBe(200)
    expect((await stranger('GET', '/api/health'))!.status).toBe(200)
  })
})

describe('a request from another site', () => {
  test('is refused when it would change something', async () => {
    const { db } = await world()
    const config = {
      ...authConfigFromEnv({ MOOG_SESSION_SECRET: SECRET }),
      secret: SECRET,
    }
    const handle = createApi({ db, config })

    const response = (await handle(
      new Request('http://test/api/patches', {
        method: 'POST',
        headers: { origin: 'https://evil.example' },
        body: '{}',
      }),
    ))!
    expect(response.status).toBe(403)
  })

  test('and allowed when it only reads', async () => {
    const { db } = await world()
    const handle = createApi({ db, config: authConfigFromEnv({}) })
    const response = (await handle(
      new Request('http://test/api/session', { headers: { origin: 'https://evil.example' } }),
    ))!
    expect(response.status).toBe(200)
  })
})

describe('every answer', () => {
  test('says it is private and varies by cookie', async () => {
    const { mine } = await world()
    const response = (await mine.call('GET', '/api/patches'))!
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('vary')).toBe('Cookie')
  })
})

/* The privilege was half unreachable before the page existed: `mayWrite`
   admitted it and `mayRead` did not, and `find` runs the read rule first, so an
   administrator could edit somebody's *public* patch through the API while a
   private one answered 404 before the write rule was consulted. */
describe('administering everybody’s patches', () => {
  test('lists every patch on the install, whoever owns it', async () => {
    const { mine, theirs, boss, own } = await world()
    await own(mine, 'Mine', 'private')
    await own(theirs, 'Theirs', 'private')

    const response = (await boss.call('GET', '/api/patches/all'))!
    expect(response.status).toBe(200)

    const names = ((await response.json()) as { name: string }[]).map((row) => row.name).sort()
    expect(names).toEqual(['Mine', 'Sub Bass', 'Theirs'])
  })

  test('is not a list an ordinary account may ask for', async () => {
    const { mine } = await world()
    expect((await mine.call('GET', '/api/patches/all'))!.status).toBe(403)
  })

  test('is not a list somebody signed out may ask for', async () => {
    const { stranger } = await world()
    expect((await stranger('GET', '/api/patches/all'))!.status).toBe(401)
  })

  test('opens somebody else’s private patch, which it could not before', async () => {
    const { theirs, boss, own } = await world()
    const patch = await own(theirs, 'Theirs', 'private')

    expect((await boss.call('GET', `/api/patches/${patch.id}`))!.status).toBe(200)
  })

  test('and still refuses it to everybody else', async () => {
    const { mine, theirs, own } = await world()
    const patch = await own(theirs, 'Theirs', 'private')

    expect((await mine.call('GET', `/api/patches/${patch.id}`))!.status).toBe(404)
  })

  /* Follows from reading it, since `create({ from })` reads through the same
     rule. Consistent with already being able to edit it, and written down so it
     is a decision rather than something nobody noticed. */
  test('may copy one, which reading it implies', async () => {
    const { theirs, boss, own } = await world()
    const patch = await own(theirs, 'Theirs', 'private')

    const response = (await boss.call('POST', '/api/patches', {
      ...createPatch({ name: 'A copy' }),
      id: undefined,
      from: patch.id,
    }))!
    expect(response.status).toBe(201)
  })

  test('a factory patch is in the list and still refused to write', async () => {
    const { boss } = await world()
    const rows = (await (await boss.call('GET', '/api/patches/all'))!.json()) as {
      id: string
      origin: string
    }[]

    expect(rows.find((row) => row.id === 'sub-bass')?.origin).toBe('factory')
    expect((await boss.call('DELETE', '/api/patches/sub-bass'))!.status).toBe(403)
  })
})

describe('a trash of your own', () => {
  test('holds what you deleted and nothing of anybody else’s', async () => {
    const { mine, theirs, own } = await world()
    const ours = await own(mine, 'Mine', 'private')
    const not = await own(theirs, 'Theirs', 'private')
    await mine.call('DELETE', `/api/patches/${ours.id}`)
    await theirs.call('DELETE', `/api/patches/${not.id}`)

    const rows = (await (await mine.call('GET', '/api/patches/trash'))!.json()) as {
      name: string
    }[]
    expect(rows.map((row) => row.name)).toEqual(['Mine'])
  })

  test('needs no privilege, because everybody has one', async () => {
    const { mine } = await world()
    expect((await mine.call('GET', '/api/patches/trash'))!.status).toBe(200)
  })

  test('says when the sweep will take each row', async () => {
    const { mine, own } = await world()
    const patch = await own(mine, 'Mine', 'private')
    await mine.call('DELETE', `/api/patches/${patch.id}`)

    const [row] = (await (await mine.call('GET', '/api/patches/trash'))!.json()) as {
      deletedAt: string
      purgeAt: string
    }[]
    /* The default window, thirty days on from the deletion. */
    expect(Date.parse(row!.purgeAt) - Date.parse(row!.deletedAt)).toBe(30 * 24 * 60 * 60 * 1000)
  })

  test('puts one back where it came from', async () => {
    const { mine, own } = await world()
    const patch = await own(mine, 'Mine', 'private')
    await mine.call('DELETE', `/api/patches/${patch.id}`)

    expect((await mine.call('POST', `/api/patches/${patch.id}/restore`))!.status).toBe(200)
    expect((await mine.call('GET', `/api/patches/${patch.id}`))!.status).toBe(200)
    expect(((await (await mine.call('GET', '/api/patches/trash'))!.json()) as unknown[])).toEqual([])
  })
})
