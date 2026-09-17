import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApi } from '../server/api.ts'
import { openDatabase } from '../server/db.ts'
import { syncInstruments } from '../server/factory.ts'
import { authConfigFromEnv } from '../server/identity.ts'
import { seedTags } from '../server/services/tags.ts'

/* The dispatcher's own answers, apart from any one route: what it does with an
   address nothing declares, with the right address at the wrong method, and
   with the segment a route captures. */

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function server() {
  const root = mkdtempSync(join(tmpdir(), 'moog-table-'))
  roots.push(root)
  const db = openDatabase(join(root, 'moog.db'))
  syncInstruments(db)
  seedTags(db)

  const handle = createApi({ db, config: authConfigFromEnv({}) })
  return (method: string, path: string, payload?: unknown) =>
    handle(
      new Request(`http://test${path}`, {
        method,
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      }),
    )
}

describe('an address the table does not declare', () => {
  test('is a 404, not a 405', async () => {
    expect((await server()('GET', '/api/nonsense'))!.status).toBe(404)
  })

  test('is still ours, so the app is not served in its place', async () => {
    expect(await server()('GET', '/api/nonsense')).not.toBeNull()
  })

  test('outside /api/ is declined altogether, so the page can be served', async () => {
    expect(await server()('GET', '/library')).toBeNull()
  })
})

describe('a declared address at a method it does not answer', () => {
  test('is a 405, because the path exists and the verb does not', async () => {
    expect((await server()('PUT', '/api/tags'))!.status).toBe(405)
  })

  test('is not confused with the same verb on a sibling path', async () => {
    const call = server()
    expect((await call('POST', '/api/tags', { name: 'Klaxon' }))!.status).toBe(201)
  })
})

describe('a captured segment', () => {
  test('reaches the handler that asked for it', async () => {
    const call = server()
    const made = (await (await call('POST', '/api/tags', { name: 'Klaxon' }))!.json()) as {
      id: number
    }

    const removed = (await call('DELETE', `/api/tags/${made.id}`))!
    expect(removed.status).toBe(200)
    expect(await removed.json()).toEqual({ removed: made.id })
  })

  test('is refused as a bad request when it cannot be what the route needs', async () => {
    expect((await server()('DELETE', '/api/tags/not-a-number'))!.status).toBe(400)
  })

  test('does not swallow a literal sibling declared beside it', async () => {
    /* /tags/in-use and /tags/:id share a shape; the literal has to win. */
    expect((await server()('GET', '/api/tags/in-use'))!.status).toBe(200)
  })
})

describe('the factory bank', () => {
  test('refuses a write as read-only rather than as a wrong method', async () => {
    const call = server()
    expect((await call('POST', '/api/presets'))!.status).toBe(403)
    expect((await call('PUT', '/api/presets/sub-bass', {}))!.status).toBe(403)
  })

  test('has no route for one preset, because it is read through /api/patches', async () => {
    expect((await server()('GET', '/api/presets/sub-bass'))!.status).toBe(404)
  })
})
