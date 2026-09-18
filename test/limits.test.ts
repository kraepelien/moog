import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApi } from '@server/api.ts'
import { openDatabase } from '@server/db.ts'
import { syncInstruments } from '@server/factory.ts'
import { authConfigFromEnv, sessionCookie } from '@server/identity.ts'
import { callerKey, createRateLimiter, type Limits, limitsFromEnv } from '@server/limits.ts'
import { createRepositories } from '@server/repositories/index.ts'
import { createUsers } from '@server/repositories/users.ts'
import { createPatch, type Patch } from '@patch/schema.ts'

const roots: string[] = []
const SECRET = 'limits-secret'

async function world(over: Partial<Limits> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'moog-limits-'))
  roots.push(root)
  const db = openDatabase(join(root, 'moog.db'))
  syncInstruments(db)

  const config = {
    ...authConfigFromEnv({ MOOG_SESSION_SECRET: SECRET }),
    mode: 'oauth' as const,
    secret: SECRET,
    admins: ['boss@example.com'],
  }
  const limits = { ...limitsFromEnv({}), ...over }
  const handle = createApi({ db, config, limits })

  const person = async (uid: string, email: string) => {
    createUsers(db).ensure({ uid, provider: 'test', subject: uid, email, displayName: uid })
    const cookie = (await sessionCookie(uid, config, new Request('https://x/'), Date.now())).split(
      ';',
    )[0]!
    return (method: string, path: string, payload?: unknown) =>
      handle(
        new Request(`http://test${path}`, {
          method,
          headers: { cookie },
          ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
        }),
      )
  }

  return { db, store: createRepositories(db), limits, person }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const aPatch = (name: string, visibility: Patch['visibility'] = 'private') => ({
  ...createPatch({ name, visibility }),
  id: undefined,
})

describe('how much one person may keep', () => {
  test('is capped, and the one over the line is not stored', async () => {
    const { person } = await world({ maxPatches: 2 })
    const call = await person('u1', 'u1@example.com')

    for (let i = 0; i < 2; i++) {
      expect((await call('POST', '/api/patches', aPatch(`Patch ${i}`)))!.status).toBe(201)
    }

    const refused = (await call('POST', '/api/patches', aPatch('One too many')))!
    expect(refused.status).toBe(413)
    expect((await refused.json()).error).toContain('2 patches')

    expect((await (await call('GET', '/api/patches'))!.json()) as Patch[]).toHaveLength(2)
  })

  test('counts what is there rather than what has ever been saved', async () => {
    const { person } = await world({ maxPatches: 1 })
    const call = await person('u1', 'u1@example.com')

    const first = (await (await call('POST', '/api/patches', aPatch('First')))!.json()) as Patch
    expect((await call('POST', '/api/patches', aPatch('Second')))!.status).toBe(413)

    await call('DELETE', `/api/patches/${first.id}`)
    expect((await call('POST', '/api/patches', aPatch('Second')))!.status).toBe(201)
  })

  test('is one cap each, not one between everybody', async () => {
    const { person } = await world({ maxPatches: 1 })
    const mine = await person('u1', 'u1@example.com')
    const theirs = await person('u2', 'u2@example.com')

    await mine('POST', '/api/patches', aPatch('Mine'))
    expect((await theirs('POST', '/api/patches', aPatch('Theirs')))!.status).toBe(201)
  })
})

describe('how big one patch may be', () => {
  const huge = () =>
    Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`invented${i}`, 'x'.repeat(50)]))

  test('is capped on the way in', async () => {
    const { person } = await world({ maxPatchBytes: 1024 })
    const call = await person('u1', 'u1@example.com')

    const refused = (await call('POST', '/api/patches', {
      ...aPatch('Huge'),
      values: huge(),
    }))!
    expect(refused.status).toBe(413)
    expect((await refused.json()).error).toContain('control values')
  })

  test('is capped again on a save, so one cannot grow past it', async () => {
    const { store, person } = await world({ maxPatchBytes: 1024 })
    const call = await person('u1', 'u1@example.com')
    const small = (await (await call('POST', '/api/patches', aPatch('Small')))!.json()) as Patch

    const response = (await call('PUT', `/api/patches/${small.id}`, {
      ...small,
      values: huge(),
    }))!
    expect(response.status).toBe(413)
    expect(store.patches.get(small.id)!.values).toEqual(small.values)
  })

  test('leaves a patch of the whole panel far below the line', async () => {
    const whole = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`control${i}`, 5.25]))
    expect(JSON.stringify(whole).length).toBeLessThan(limitsFromEnv({}).maxPatchBytes / 4)
  })
})

describe('how fast anyone may write', () => {
  test('a burst gets through and a flood does not', async () => {
    const { person } = await world({ writesPerMinute: 3 })
    const call = await person('u1', 'u1@example.com')

    const codes: number[] = []
    for (let i = 0; i < 5; i++) {
      codes.push((await call('POST', '/api/patches', aPatch(`Patch ${i}`)))!.status)
    }

    expect(codes.filter((code) => code === 201)).toHaveLength(3)
    expect(codes.filter((code) => code === 429)).toHaveLength(2)
  })

  test('one runaway client does not spend anybody else allowance', async () => {
    const { person } = await world({ writesPerMinute: 2 })
    const mine = await person('u1', 'u1@example.com')
    const theirs = await person('u2', 'u2@example.com')

    for (let i = 0; i < 4; i++) await mine('POST', '/api/patches', aPatch(`Mine ${i}`))
    expect((await theirs('POST', '/api/patches', aPatch('Theirs')))!.status).toBe(201)
  })

  test('reading is never limited', async () => {
    const { person } = await world({ writesPerMinute: 1 })
    const call = await person('u1', 'u1@example.com')
    await call('POST', '/api/patches', aPatch('One'))

    for (let i = 0; i < 10; i++) {
      expect((await call('GET', '/api/library'))!.status).toBe(200)
    }
  })

  test('the bucket refills', () => {
    let clock = 0
    const limiter = createRateLimiter(2, () => clock)
    expect(limiter.allow('someone')).toBe(true)
    expect(limiter.allow('someone')).toBe(true)
    expect(limiter.allow('someone')).toBe(false)

    clock += 60_000
    expect(limiter.allow('someone')).toBe(true)
  })

  test('counts an address while there is nobody signed in', () => {
    const forwarded = new Request('http://x/', {
      headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' },
    })
    expect(callerKey(forwarded, null)).toBe('ip:1.2.3.4')
    expect(callerKey(forwarded, 'google-abc')).toBe('user:google-abc')
  })

  test('holds the door on sign-in too', async () => {
    const { db } = await world()
    const config = {
      ...authConfigFromEnv({ MOOG_SESSION_SECRET: SECRET }),
      mode: 'oauth' as const,
      secret: SECRET,
      clientId: 'client',
      clientSecret: 'secret',
      publicOrigin: 'http://test',
    }
    const handle = createApi({ db, config, limits: { ...limitsFromEnv({}), signInsPerMinute: 2 } })
    const start = () => handle(new Request('http://test/api/auth/google/start'))

    expect((await start())!.status).not.toBe(429)
    expect((await start())!.status).not.toBe(429)
    expect((await start())!.status).toBe(429)
  })
})

describe('taking something out of the shared library', () => {
  test('leaves the patch otherwise as it was', async () => {
    const { store, person } = await world()
    const mine = await person('u1', 'u1@example.com')
    const boss = await person('u-boss', 'boss@example.com')

    const patch = (await (
      await mine('POST', '/api/patches', aPatch('Loud', 'public'))
    )!.json()) as Patch
    expect(patch.visibility).toBe('public')

    expect((await boss('POST', `/api/patches/${patch.id}/unpublish`))!.status).toBe(200)

    const after = store.patches.get(patch.id)!
    expect(after.visibility).toBe('private')
    expect(after.name).toBe('Loud')
    expect(after.values).toEqual(patch.values)
  })

  test('is not something a stranger can do', async () => {
    const { store, person } = await world()
    const mine = await person('u1', 'u1@example.com')
    const stranger = await person('u2', 'u2@example.com')

    const patch = (await (
      await mine('POST', '/api/patches', aPatch('Loud', 'public'))
    )!.json()) as Patch

    expect((await stranger('POST', `/api/patches/${patch.id}/unpublish`))!.status).toBe(403)
    expect(store.patches.get(patch.id)!.visibility).toBe('public')
  })

  test('is something the owner can do to their own', async () => {
    const { person } = await world()
    const mine = await person('u1', 'u1@example.com')
    const patch = (await (
      await mine('POST', '/api/patches', aPatch('Mine', 'public'))
    )!.json()) as Patch

    expect((await mine('POST', `/api/patches/${patch.id}/unpublish`))!.status).toBe(200)
  })

  test('cannot reach a factory patch', async () => {
    const { store, person } = await world()
    store.patches.putFactory('sub-bass', { ...createPatch({ name: 'Sub Bass' }), id: 'sub-bass' })
    const boss = await person('u-boss', 'boss@example.com')

    expect((await boss('POST', '/api/patches/sub-bass/unpublish'))!.status).toBe(403)
  })
})

describe('the trash', () => {
  test('empties of what has been in it too long and keeps the rest', async () => {
    const { db, store, person } = await world()
    const call = await person('u1', 'u1@example.com')

    const old = (await (await call('POST', '/api/patches', aPatch('Old')))!.json()) as Patch
    const recent = (await (await call('POST', '/api/patches', aPatch('Recent')))!.json()) as Patch
    await call('DELETE', `/api/patches/${old.id}`)
    await call('DELETE', `/api/patches/${recent.id}`)

    db.run(`update patches set deleted_at = ? where uid = ?`, ['2020-01-01T00:00:00.000Z', old.id])

    expect(store.patches.purgeTrash('2021-01-01T00:00:00.000Z')).toBe(1)
    expect(store.patches.locate(old.id)).toBeNull()
    expect(store.patches.locate(recent.id)).not.toBeNull()
  })

  test('never takes anything still in use', async () => {
    const { store, person } = await world()
    const call = await person('u1', 'u1@example.com')
    await call('POST', '/api/patches', aPatch('Kept'))

    expect(store.patches.purgeTrash(new Date().toISOString())).toBe(0)
  })
})
