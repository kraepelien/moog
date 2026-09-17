import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PRIVILEGE, ROLE } from '@access/privileges.ts'
import { createApi } from '@server/api.ts'
import { openDatabase } from '@server/db.ts'
import { syncInstruments } from '@server/factory.ts'
import { authConfigFromEnv, sessionCookie } from '@server/identity.ts'
import { createRepositories } from '@server/repositories/index.ts'
import { seedTags } from '@server/services/tags.ts'

/* What a request is allowed to do, end to end: the column, the environment and
   the route table agreeing on one answer. */

const roots: string[] = []
const SECRET = 'access-secret'

async function world(admins: readonly string[] = ['boss@example.com']) {
  const root = mkdtempSync(join(tmpdir(), 'moog-access-'))
  roots.push(root)
  const db = openDatabase(join(root, 'moog.db'))
  syncInstruments(db)
  seedTags(db)

  const config = {
    ...authConfigFromEnv({ MOOG_SESSION_SECRET: SECRET }),
    mode: 'oauth' as const,
    secret: SECRET,
    admins,
  }
  const handle = createApi({ db, config })
  const repositories = createRepositories(db)

  const person = async (uid: string, email: string) => {
    repositories.users.ensure({ uid, provider: 'test', subject: uid, email, displayName: uid })
    const cookie = (
      await sessionCookie(uid, config, new Request('https://x/'), Date.now())
    ).split(';')[0]!
    return (method: string, path: string, payload?: unknown) =>
      handle(
        new Request(`http://test${path}`, {
          method,
          headers: { cookie },
          ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
        }),
      )
  }

  return { db, repositories, handle, person }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const session = async (call: (method: string, path: string) => Promise<Response | null>) =>
  (await (await call('GET', '/api/session'))!.json()) as {
    roles: string[]
    privileges: string[]
    signedIn: boolean
  }

describe('the session route', () => {
  test('hands the browser what it may do, so a guard has something to read', async () => {
    const { person } = await world()
    const boss = await person('u-boss', 'boss@example.com')

    const said = await session(boss)
    expect(said.signedIn).toBe(true)
    expect(said.roles).toContain(ROLE.admin)
    expect(said.privileges).toContain(PRIVILEGE.AdminTags)
  })

  test('gives an ordinary member the member set and nothing more', async () => {
    const { person } = await world()
    const punter = await person('u-punter', 'punter@example.com')

    const said = await session(punter)
    expect(said.privileges).toEqual([PRIVILEGE.StoreMidi])
    expect(said.roles).toEqual([ROLE.member])
  })

  test('answers a stranger without refusing, because it is how the app asks', async () => {
    const { handle } = await world()
    const response = (await handle(new Request('http://test/api/session')))!

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ signedIn: false, privileges: [], roles: [] })
  })
})

describe('what the environment grants', () => {
  test('makes a listed address an admin without them signing in again', async () => {
    /* MOOG_ADMINS already worked this way: a line in .env and a restart. A
       grant that only landed at the next sign-in would look like it was
       ignored. */
    const { person } = await world(['late@example.com'])
    const late = await person('u-late', 'late@example.com')

    expect((await session(late)).roles).toContain(ROLE.admin)
  })

  test('never revokes, so a grant made in the app survives the list', async () => {
    const { person, repositories } = await world([])
    const granted = await person('u-granted', 'granted@example.com')
    repositories.users.grant('u-granted', ROLE.admin)

    expect((await session(granted)).roles).toContain(ROLE.admin)
  })

  test('leaves somebody not listed a member', async () => {
    const { person } = await world(['boss@example.com'])
    const punter = await person('u-punter', 'punter@example.com')

    expect((await session(punter)).roles).not.toContain(ROLE.admin)
  })
})

describe('a route that needs a privilege', () => {
  test('refuses a member with 403 and serves an admin', async () => {
    const { person } = await world()
    const punter = await person('u-punter', 'punter@example.com')
    const boss = await person('u-boss', 'boss@example.com')

    expect((await punter('GET', '/api/tags/in-use'))!.status).toBe(403)
    expect((await boss('GET', '/api/tags/in-use'))!.status).toBe(200)
  })

  test('refuses a stranger with 401 rather than 403, having nobody to refuse', async () => {
    const { handle } = await world()
    const response = (await handle(new Request('http://test/api/tags/in-use')))!

    expect(response.status).toBe(401)
  })

  test('leaves the open half of the same resource alone', async () => {
    const { handle } = await world()
    const response = (await handle(new Request('http://test/api/tags')))!

    expect(response.status).toBe(200)
    expect((await response.json()) as unknown[]).not.toHaveLength(0)
  })
})

describe('a profile coming back from the provider', () => {
  test('refreshes the name but never the roles', async () => {
    const { repositories } = await world([])
    repositories.users.ensure({ uid: 'u-1', provider: 'test', subject: '1', displayName: 'Old' })
    repositories.users.grant('u-1', ROLE.admin)

    const again = repositories.users.ensure({
      uid: 'u-1',
      provider: 'test',
      subject: '1',
      displayName: 'New',
    })

    expect(again.display_name).toBe('New')
    expect(repositories.users.rolesOf(again)).toContain(ROLE.admin)
  })
})

describe('with sign-in off', () => {
  test('the local user holds admin by holding the role, not by an exception', async () => {
    const root = mkdtempSync(join(tmpdir(), 'moog-access-off-'))
    roots.push(root)
    const db = openDatabase(join(root, 'moog.db'))
    syncInstruments(db)

    const config = authConfigFromEnv({})
    const handle = createApi({ db, config })

    const said = (await (await handle(new Request('http://test/api/session')))!.json()) as {
      roles: string[]
      privileges: string[]
    }
    expect(said.roles).toContain(ROLE.admin)
    expect(said.privileges).toContain(PRIVILEGE.AccessAdmin)

    const stored = createRepositories(db).users.find(config.localUser)!
    expect(stored.roles).toContain(ROLE.admin)
  })
})
