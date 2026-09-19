import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PRIVILEGE, ROLE } from '@access/privileges.ts'
import { toBase64, type Arrangement } from '@components/midi/arrangement.ts'
import { createPatch, type Patch } from '@patch/schema.ts'
import { createApi } from '@server/api.ts'
import { openDatabase } from '@server/db.ts'
import { syncInstruments } from '@server/factory.ts'
import { authConfigFromEnv, sessionCookie } from '@server/identity.ts'
import { createRepositories } from '@server/repositories/index.ts'

/* A MIDI file and the sounds put on it, kept per person. What these pin is that
   the privilege is the only door, that one person's arrangements are invisible
   to another, and that a part may only point at a patch its owner could see. */

const roots: string[] = []
const SECRET = 'arrangement-secret'
const MIDI = toBase64(new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6]))

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

async function world() {
  const root = mkdtempSync(join(tmpdir(), 'moog-arr-'))
  roots.push(root)
  const db = openDatabase(join(root, 'moog.db'))
  syncInstruments(db)

  const config = {
    ...authConfigFromEnv({ MOOG_SESSION_SECRET: SECRET }),
    mode: 'oauth' as const,
    secret: SECRET,
    admins: [],
  }
  const handle = createApi({ db, config })
  const repositories = createRepositories(db)

  /* Tester by default: StoreMidi sits on that rung, so an account without it
     is testing the refusal rather than the feature. */
  const person = async (uid: string, roles: readonly string[] = [ROLE.tester]) => {
    repositories.users.ensure({
      uid,
      provider: 'test',
      subject: uid,
      email: `${uid}@example.com`,
      displayName: uid,
      roles: roles as never,
    })
    const cookie = (
      await sessionCookie(uid, config, new Request('https://x/'), Date.now())
    ).split(';')[0]!

    const call = (method: string, path: string, payload?: unknown) =>
      handle(
        new Request(`http://test${path}`, {
          method,
          headers: { cookie },
          ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
        }),
      )

    return {
      call,
      row: repositories.users.find(uid)!,
      /* A patch of their own, which is what a part is allowed to point at. */
      patch(name: string, visibility: 'private' | 'public' = 'private'): Patch {
        const made = createPatch({ name, visibility })
        return repositories.patches.create(made, repositories.users.find(uid)!.id, made.id)
      },
    }
  }

  return { db, repositories, handle, person }
}

const body = async <T,>(response: Response | null): Promise<T> => (await response!.json()) as T

const anArrangement = (parts: Record<string, { patchId: string; name: string }> = {}) => ({
  name: 'Night Drive',
  fileName: 'song.mid',
  midi: MIDI,
  bpm: '120',
  parts,
  soloed: [],
  muted: [],
})

describe('the privilege', () => {
  test('is the door: without it every route refuses', async () => {
    const { person, repositories } = await world()
    const nobody = await person('u-nobody')
    repositories.users.setOverride(
      repositories.users.find('u-nobody')!.id,
      PRIVILEGE.StoreMidi,
      false,
      null,
    )

    expect((await nobody.call('GET', '/api/arrangements'))!.status).toBe(403)
    expect((await nobody.call('POST', '/api/arrangements', anArrangement()))!.status).toBe(403)
    expect((await nobody.call('GET', '/api/arrangements/whatever'))!.status).toBe(403)
    expect((await nobody.call('DELETE', '/api/arrangements/whatever'))!.status).toBe(403)
  })

  test('comes with the tester role, which is what StoreMidi sits on', async () => {
    const { person } = await world()
    const tester = await person('u-tester', [ROLE.tester])

    const said = await body<{ privileges: string[] }>(await tester.call('GET', '/api/session'))
    expect(said.privileges).toContain(PRIVILEGE.StoreMidi)
    expect((await tester.call('GET', '/api/arrangements'))!.status).toBe(200)
  })

  /* Signing in is not itself permission to keep files on the server, so the
     rung below is refused the same way an explicit revoke is. */
  test('is not something a plain member has', async () => {
    const { person } = await world()
    const member = await person('u-member', [ROLE.member])

    const said = await body<{ privileges: string[] }>(await member.call('GET', '/api/session'))
    expect(said.privileges).not.toContain(PRIVILEGE.StoreMidi)
    expect((await member.call('GET', '/api/arrangements'))!.status).toBe(403)
  })

  test('refuses a stranger with 401, having nobody to refuse', async () => {
    const { handle } = await world()
    expect((await handle(new Request('http://test/api/arrangements')))!.status).toBe(401)
  })
})

describe('keeping one', () => {
  test('gives it an id and hands it back', async () => {
    const { person } = await world()
    const me = await person('u-me')
    const bass = me.patch('Bass')

    const response = (await me.call(
      'POST',
      '/api/arrangements',
      anArrangement({ '1': { patchId: bass.id, name: 'Bass' } }),
    ))!
    expect(response.status).toBe(201)

    const saved = (await response.json()) as Arrangement
    expect(saved.id).toBeTruthy()
    expect(saved.name).toBe('Night Drive')
    expect(saved.midi).toBe(MIDI)
    expect(saved.parts).toEqual({ '1': { patchId: bass.id, name: 'Bass' } })
  })

  test('lists it without carrying the file in the row', async () => {
    const { person } = await world()
    const me = await person('u-me')
    await me.call('POST', '/api/arrangements', anArrangement())

    const rows = await body<Record<string, unknown>[]>(await me.call('GET', '/api/arrangements'))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ name: 'Night Drive', fileName: 'song.mid', parts: 0 })
    expect(rows[0]!.midi).toBeUndefined()
  })

  test('writes over the one named rather than adding another', async () => {
    const { person } = await world()
    const me = await person('u-me')
    const made = await body<Arrangement>(
      await me.call('POST', '/api/arrangements', anArrangement()),
    )

    const again = (await me.call('PUT', `/api/arrangements/${made.id}`, {
      ...anArrangement(),
      name: 'Renamed',
    }))!
    expect(again.status).toBe(200)

    const rows = await body<unknown[]>(await me.call('GET', '/api/arrangements'))
    expect(rows).toHaveLength(1)
    expect((await body<Arrangement>(await me.call('GET', `/api/arrangements/${made.id}`))).name)
      .toBe('Renamed')
  })

  test('needs a name and a file', async () => {
    const { person } = await world()
    const me = await person('u-me')

    expect(
      (await me.call('POST', '/api/arrangements', { ...anArrangement(), name: '  ' }))!.status,
    ).toBe(400)
    expect(
      (await me.call('POST', '/api/arrangements', { ...anArrangement(), midi: '' }))!.status,
    ).toBe(400)
  })

  test('is deleted for good', async () => {
    const { person } = await world()
    const me = await person('u-me')
    const made = await body<Arrangement>(
      await me.call('POST', '/api/arrangements', anArrangement()),
    )

    expect((await me.call('DELETE', `/api/arrangements/${made.id}`))!.status).toBe(200)
    expect((await me.call('GET', `/api/arrangements/${made.id}`))!.status).toBe(404)
  })
})

/* One of these belongs to exactly one person, so somebody else's id is not
   found rather than refused — there is nothing to confirm the existence of. */
describe('somebody else', () => {
  test('cannot see mine in their list', async () => {
    const { person } = await world()
    const me = await person('u-me')
    const them = await person('u-them')
    await me.call('POST', '/api/arrangements', anArrangement())

    expect(await body<unknown[]>(await them.call('GET', '/api/arrangements'))).toEqual([])
  })

  test('cannot read, overwrite or delete one of mine', async () => {
    const { person } = await world()
    const me = await person('u-me')
    const them = await person('u-them')
    const made = await body<Arrangement>(
      await me.call('POST', '/api/arrangements', anArrangement()),
    )

    expect((await them.call('GET', `/api/arrangements/${made.id}`))!.status).toBe(404)
    expect((await them.call('PUT', `/api/arrangements/${made.id}`, anArrangement()))!.status).toBe(
      404,
    )
    expect((await them.call('DELETE', `/api/arrangements/${made.id}`))!.status).toBe(404)
  })
})

/* The sounds are a reference, so a part that cannot be resolved is a silent
   part rather than a refused save: one missing sound must not cost the other
   fifteen. */
describe('a part pointing at a patch', () => {
  test('is dropped when the patch is not one the owner may see', async () => {
    const { person } = await world()
    const me = await person('u-me')
    const them = await person('u-them')
    const theirs = them.patch('Private Bass')

    const saved = await body<Arrangement>(
      await me.call(
        'POST',
        '/api/arrangements',
        anArrangement({ '1': { patchId: theirs.id, name: 'Private Bass' } }),
      ),
    )
    expect(saved.parts).toEqual({})
  })

  test('is kept when the patch is published', async () => {
    const { person } = await world()
    const me = await person('u-me')
    const them = await person('u-them')
    const shared = them.patch('Shared Bass', 'public')

    const saved = await body<Arrangement>(
      await me.call(
        'POST',
        '/api/arrangements',
        anArrangement({ '1': { patchId: shared.id, name: 'Shared Bass' } }),
      ),
    )
    expect(saved.parts).toEqual({ '1': { patchId: shared.id, name: 'Shared Bass' } })
  })

  test('is dropped when it names a patch that is not there at all', async () => {
    const { person } = await world()
    const me = await person('u-me')

    const saved = await body<Arrangement>(
      await me.call(
        'POST',
        '/api/arrangements',
        anArrangement({ '1': { patchId: 'never-saved', name: 'Ghost' } }),
      ),
    )
    expect(saved.parts).toEqual({})
  })

  test('is dropped when its channel is not one a MIDI file has', async () => {
    const { person } = await world()
    const me = await person('u-me')
    const bass = me.patch('Bass')

    const saved = await body<Arrangement>(
      await me.call(
        'POST',
        '/api/arrangements',
        anArrangement({ '99': { patchId: bass.id, name: 'Bass' } }),
      ),
    )
    expect(saved.parts).toEqual({})
  })
})
