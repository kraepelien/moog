import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApi } from '@server/api.ts'
import { openDatabase } from '@server/db.ts'
import { syncInstruments } from '@server/factory.ts'
import { authConfigFromEnv, sessionCookie } from '@server/identity.ts'
import { seedTags } from '@server/services/tags.ts'
import { createUsers } from '@server/repositories/users.ts'
import type { TagInUse } from '@admin/tags.ts'
import { createPatch, type Patch } from '@patch/schema.ts'

/* The routes behind the admin page. What the seeding is for is pinned in
   tags.test.ts; what matters here is that only an admin may edit the list, and
   that removing a name leaves the patches wearing it alone — a patch stores the
   string, not a reference. */

const roots: string[] = []
const SECRET = 'tags-secret'

async function world() {
  const root = mkdtempSync(join(tmpdir(), 'moog-tags-'))
  roots.push(root)
  const db = openDatabase(join(root, 'moog.db'))
  syncInstruments(db)
  seedTags(db, ['Bass', 'Lead'])

  const config = {
    ...authConfigFromEnv({ MOOG_SESSION_SECRET: SECRET }),
    mode: 'oauth' as const,
    secret: SECRET,
    admins: ['boss@example.com'],
  }
  const handle = createApi({ db, config })

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

  const boss = await person('u-boss', 'boss@example.com')
  const punter = await person('u-punter', 'punter@example.com')
  const names = async () =>
    ((await (await boss('GET', '/api/tags'))!.json()) as { name: string }[]).map((tag) => tag.name)

  return { db, boss, punter, names }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('reading the list', () => {
  test('is open to anyone signed in, because the save form needs it', async () => {
    const { punter } = await world()
    const response = (await punter('GET', '/api/tags'))!
    expect(response.status).toBe(200)
    expect((await response.json()).map((tag: { name: string }) => tag.name)).toEqual([
      'Bass',
      'Lead',
    ])
  })

  test('with the counts is not, because they are over everybody', async () => {
    const { boss, punter } = await world()
    expect((await punter('GET', '/api/tags/in-use'))!.status).toBe(403)
    expect((await boss('GET', '/api/tags/in-use'))!.status).toBe(200)
  })
})

describe('adding one', () => {
  test('puts it on the list in its place', async () => {
    const { boss, names } = await world()
    const response = (await boss('POST', '/api/tags', { name: 'Drones' }))!
    expect(response.status).toBe(201)
    expect(await names()).toEqual(['Bass', 'Drones', 'Lead'])
  })

  test('trims what was typed', async () => {
    const { boss, names } = await world()
    await boss('POST', '/api/tags', { name: '  Pad  ' })
    expect(await names()).toContain('Pad')
  })

  test('refuses one the list already has, whatever its case', async () => {
    const { boss, names } = await world()
    const response = (await boss('POST', '/api/tags', { name: 'bass' }))!
    expect(response.status).toBe(409)
    expect(await names()).toEqual(['Bass', 'Lead'])
  })

  test('refuses a name that is not one', async () => {
    const { boss, names } = await world()
    expect((await boss('POST', '/api/tags', { name: '   ' }))!.status).toBe(400)
    expect((await boss('POST', '/api/tags', { name: 'x'.repeat(200) }))!.status).toBe(400)
    expect((await boss('POST', '/api/tags', { name: 42 }))!.status).toBe(400)
    expect(await names()).toEqual(['Bass', 'Lead'])
  })

  test('is refused to anyone else', async () => {
    const { punter, names } = await world()
    expect((await punter('POST', '/api/tags', { name: 'Sneaky' }))!.status).toBe(403)
    expect(await names()).toEqual(['Bass', 'Lead'])
  })
})

describe('colouring one', () => {
  const rows = async (call: (m: string, p: string) => Promise<Response | undefined>) =>
    (await (await call('GET', '/api/tags'))!.json()) as { id: number; name: string; colour: string | null }[]

  test('starts with none, so every chip is on the hash', async () => {
    const { boss } = await world()
    expect((await rows(boss)).every((tag) => tag.colour === null)).toBe(true)
  })

  test('remembers the colour, in one case', async () => {
    const { boss } = await world()
    const bass = (await rows(boss)).find((tag) => tag.name === 'Bass')!

    const response = (await boss('PUT', `/api/tags/${bass.id}/colour`, { colour: '#FF8800' }))!
    expect(response.status).toBe(200)
    expect((await rows(boss)).find((tag) => tag.name === 'Bass')!.colour).toBe('#ff8800')
  })

  /* There is no empty hex to pick, so null is the only way back to the hash. */
  test('clears it with null', async () => {
    const { boss } = await world()
    const bass = (await rows(boss)).find((tag) => tag.name === 'Bass')!
    await boss('PUT', `/api/tags/${bass.id}/colour`, { colour: '#ff8800' })
    expect((await boss('PUT', `/api/tags/${bass.id}/colour`, { colour: null }))!.status).toBe(200)
    expect((await rows(boss)).find((tag) => tag.name === 'Bass')!.colour).toBe(null)
  })

  /* A colour reaches a style attribute, so anything that is not one is a way of
     writing CSS into everybody's page. */
  test('refuses something that is not a colour', async () => {
    const { boss } = await world()
    const bass = (await rows(boss)).find((tag) => tag.name === 'Bass')!
    for (const colour of ['rebeccapurple', '#fff; background: url(http://elsewhere/)', 7]) {
      expect((await boss('PUT', `/api/tags/${bass.id}/colour`, { colour }))!.status).toBe(400)
    }
    expect((await rows(boss)).find((tag) => tag.name === 'Bass')!.colour).toBe(null)
  })

  test('says so when there is no such row', async () => {
    const { boss } = await world()
    expect((await boss('PUT', '/api/tags/999/colour', { colour: '#ffffff' }))!.status).toBe(404)
  })

  test('is refused to anyone else', async () => {
    const { boss, punter } = await world()
    const bass = (await rows(boss)).find((tag) => tag.name === 'Bass')!
    expect((await punter('PUT', `/api/tags/${bass.id}/colour`, { colour: '#ffffff' }))!.status).toBe(
      403,
    )
    expect((await rows(boss)).find((tag) => tag.name === 'Bass')!.colour).toBe(null)
  })
})

describe('removing one', () => {
  test('takes it off the list and leaves the patches wearing it', async () => {
    const { boss, names } = await world()
    const saved = (await (
      await boss('POST', '/api/patches', {
        ...createPatch({ name: 'Growler', tags: ['Bass'] }),
        id: undefined,
      })
    )!.json()) as Patch

    const use = (await (await boss('GET', '/api/tags/in-use'))!.json()) as TagInUse[]
    const bass = use.find((tag) => tag.name === 'Bass')!
    expect(bass.patches).toBe(1)

    expect((await boss('DELETE', `/api/tags/${bass.id}`))!.status).toBe(200)
    expect(await names()).toEqual(['Lead'])

    const after = (await (await boss('GET', `/api/patches/${saved.id}`))!.json()) as Patch
    expect(after.tags).toEqual(['Bass'])
  })

  test('says so when there is no such row', async () => {
    const { boss } = await world()
    expect((await boss('DELETE', '/api/tags/9999'))!.status).toBe(404)
    expect((await boss('DELETE', '/api/tags/nonsense'))!.status).toBe(400)
  })

  test('is refused to anyone else', async () => {
    const { punter, names } = await world()
    expect((await punter('DELETE', '/api/tags/1'))!.status).toBe(403)
    expect(await names()).toEqual(['Bass', 'Lead'])
  })
})

describe('the counts', () => {
  test('ignore a patch in the trash and count everybody elses', async () => {
    const { boss, punter } = await world()
    const mine = (await (
      await punter('POST', '/api/patches', {
        ...createPatch({ name: 'Theirs', tags: ['Lead'] }),
        id: undefined,
      })
    )!.json()) as Patch
    await boss('POST', '/api/patches', {
      ...createPatch({ name: 'Doomed', tags: ['Lead'] }),
      id: undefined,
    })

    const before = (await (await boss('GET', '/api/tags/in-use'))!.json()) as TagInUse[]
    expect(before.find((tag) => tag.name === 'Lead')!.patches).toBe(2)

    await punter('DELETE', `/api/patches/${mine.id}`)

    const after = (await (await boss('GET', '/api/tags/in-use'))!.json()) as TagInUse[]
    expect(after.find((tag) => tag.name === 'Lead')!.patches).toBe(1)
    expect(after.find((tag) => tag.name === 'Bass')!.patches).toBe(0)
  })
})
