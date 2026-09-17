import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApi } from '@server/api.ts'
import { openDatabase } from '@server/db.ts'
import { syncInstruments } from '@server/factory.ts'
import { authConfigFromEnv, sessionCookie } from '@server/identity.ts'
import { createUsers } from '@server/repositories/users.ts'
import type { Skin } from '@/tones.ts'

/* The app's own colours, over the wire. What sifting a skin means is pinned in
   skin.test.ts; what matters here is who may read one, who may write one, and
   that a skin is the installation's rather than an account's. */

const roots: string[] = []
const SECRET = 'skin-secret'

async function world() {
  const root = mkdtempSync(join(tmpdir(), 'moog-skin-'))
  roots.push(root)
  const db = openDatabase(join(root, 'moog.db'))
  syncInstruments(db)

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

  const stranger = (method: string, path: string, payload?: unknown) =>
    handle(
      new Request(`http://test${path}`, {
        method,
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      }),
    )

  const boss = await person('u-boss', 'boss@example.com')
  const punter = await person('u-punter', 'punter@example.com')
  const skin = async () => (await (await stranger('GET', '/api/skin'))!.json()) as Skin

  return { boss, punter, stranger, skin }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('reading it', () => {
  test('is open to somebody with no session, because the sign-in page wears it too', async () => {
    const { stranger } = await world()
    const response = (await stranger('GET', '/api/skin'))!
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({})
  })
})

describe('writing it', () => {
  test('keeps what an administrator chose, for everybody', async () => {
    const { boss, punter, skin } = await world()
    expect((await boss('PUT', '/api/skin', { bar: '#D6D6D6', barInk: '#111111' }))!.status).toBe(200)

    /* Not a preference: the person who did not set it sees it too. */
    expect(await skin()).toEqual({ bar: '#d6d6d6', barInk: '#111111' })
    expect(await (await punter('GET', '/api/skin'))!.json()).toEqual({
      bar: '#d6d6d6',
      barInk: '#111111',
    })
  })

  test('sifts out a key nothing declares and a value that is not a colour', async () => {
    const { boss, skin } = await world()
    await boss('PUT', '/api/skin', {
      page: '#101010',
      wallpaper: '#ffffff',
      card: '#fff; background: url(http://elsewhere/)',
    })
    expect(await skin()).toEqual({ page: '#101010' })
  })

  /* A skin holds only what somebody decided, so putting a colour back is
     sending a skin without it rather than sending the default. */
  test('replaces rather than merges, so a colour can be taken back off', async () => {
    const { boss, skin } = await world()
    await boss('PUT', '/api/skin', { page: '#101010', card: '#202020' })
    await boss('PUT', '/api/skin', { card: '#202020' })
    expect(await skin()).toEqual({ card: '#202020' })
  })

  test('is refused to somebody who is not one', async () => {
    const { punter, stranger, skin } = await world()
    expect((await punter('PUT', '/api/skin', { page: '#101010' }))!.status).toBe(403)
    expect((await stranger('PUT', '/api/skin', { page: '#101010' }))!.status).toBe(401)
    expect(await skin()).toEqual({})
  })
})
