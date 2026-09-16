import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApi } from '../server/api.ts'
import { createFileStore, isSafeName } from '../server/store.ts'
import { seedPresets } from '../server/seed.ts'

/* The part of the store the happy path never reaches: failed writes, races,
   hostile input, and a folder someone has edited by hand. */

const roots: string[] = []

function freshRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'moog-server-'))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const temps = (dir: string) => readdirSync(dir).filter((name) => name.endsWith('.tmp'))

describe('a name that becomes a filename', () => {
  test('accepts what a slug and an id actually look like', () => {
    for (const name of ['abc', 'A-1', 'sub_bass', '60s-space', '0']) {
      expect(isSafeName(name)).toBe(true)
    }
  })

  test('refuses anything that could leave the folder', () => {
    for (const name of ['..', '../x', 'a/b', 'a\\b', '.hidden', 'a.json', '', ' ', 'a b']) {
      expect(isSafeName(name)).toBe(false)
    }
  })

  test('refuses a name too long to be a filename', () => {
    expect(isSafeName('a'.repeat(128))).toBe(true)
    expect(isSafeName('a'.repeat(129))).toBe(false)
  })
})

describe('writing a record', () => {
  test('leaves no temp file behind', async () => {
    const store = createFileStore(freshRoot())
    await store.putPatch('one', { name: 'One' })
    expect(temps(store.layout.patches)).toEqual([])
  })

  test('that fails leaves the previous one intact and no litter', async () => {
    /* What proves the rename itself is atomic is the test below. */
    const store = createFileStore(freshRoot())
    await store.putPatch('one', { name: 'Good' })

    await expect(store.putPatch('one', { bad: 1n })).rejects.toThrow()

    expect(await store.getPatch('one')).toEqual({ name: 'Good' })
    expect(temps(store.layout.patches)).toEqual([])
  })

  test('twice at once ends with one whole record, never a fragment', async () => {
    const store = createFileStore(freshRoot())
    const writes = Array.from({ length: 25 }, (_, index) =>
      store.putPatch('one', { name: `Take ${index}`, index }),
    )
    await Promise.all(writes)

    const saved = (await store.getPatch('one')) as { index: number } | null
    expect(saved).not.toBeNull()
    expect(saved!.index).toBeGreaterThanOrEqual(0)
    expect(saved!.index).toBeLessThan(25)
    expect(temps(store.layout.patches)).toEqual([])
  })

  test('to different records at once loses none of them', async () => {
    const store = createFileStore(freshRoot())
    await Promise.all(
      Array.from({ length: 20 }, (_, index) => store.putPatch(`p${index}`, { index })),
    )
    expect(await store.listPatches()).toHaveLength(20)
  })
})

describe('reading a folder someone has been in by hand', () => {
  test('a half-written file is skipped rather than failing the listing', async () => {
    const store = createFileStore(freshRoot())
    await store.putPatch('good', { name: 'Good' })
    await writeFile(join(store.layout.patches, 'broken.json'), '{"name": "Bro', 'utf8')

    expect(await store.listPatches()).toEqual([{ name: 'Good' }])
    expect(await store.getPatch('broken')).toBeNull()
  })

  test('bookkeeping and stray files are not records', async () => {
    const store = createFileStore(freshRoot())
    await store.putPreset('real', { slug: 'real' })
    await writeFile(join(store.layout.presets, '.seeded.json'), '{"slugs":[]}', 'utf8')
    await writeFile(join(store.layout.presets, 'notes.txt'), 'hello', 'utf8')

    expect(await store.listPresets()).toEqual([{ slug: 'real' }])
  })

  test('a folder that does not exist is empty, not an error', async () => {
    const store = createFileStore(join(freshRoot(), 'never-made'))
    expect(await store.listPatches()).toEqual([])
    expect(await store.listPresets()).toEqual([])
    expect(await store.getPatch('nothing')).toBeNull()
  })

  test('an unsafe id is refused before the filesystem sees it', async () => {
    const store = createFileStore(freshRoot())
    expect(await store.getPatch('../escape')).toBeNull()
    await expect(store.putPatch('../escape', {})).rejects.toThrow(/Unsafe/)
    await expect(store.deletePatch('../escape')).rejects.toThrow(/Unsafe/)
    await expect(store.putPreset('a/b', {})).rejects.toThrow(/Unsafe/)
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

  test('leaves anything that is not the API alone', async () => {
    /* Null rather than a 404, so the caller can serve the app: a 404 here would
       mean every page load returned one. */
    const handle = createApi({ root: freshRoot() })
    expect(await call(handle, 'GET', '/')).toBeNull()
    expect(await call(handle, 'GET', '/index.html')).toBeNull()
    expect(await call(handle, 'GET', '/apiary')).toBeNull()
  })

  test('answers 404 for a resource it does not have', async () => {
    const handle = createApi({ root: freshRoot() })
    expect((await call(handle, 'GET', '/api/'))!.status).toBe(404)
    expect((await call(handle, 'GET', '/api/sounds'))!.status).toBe(404)
  })

  test('round-trips a patch', async () => {
    const handle = createApi({ root: freshRoot() })
    expect((await call(handle, 'PUT', '/api/patches/one', { name: 'One' }))!.status).toBe(200)

    const got = (await call(handle, 'GET', '/api/patches/one'))!
    expect(await got.json()).toEqual({ name: 'One' })

    expect((await call(handle, 'DELETE', '/api/patches/one'))!.status).toBe(200)
    expect((await call(handle, 'GET', '/api/patches/one'))!.status).toBe(404)
  })

  test('deleting something that is not there is not an error', async () => {
    const handle = createApi({ root: freshRoot() })
    expect((await call(handle, 'DELETE', '/api/patches/ghost'))!.status).toBe(200)
  })

  test('refuses a body that is not JSON rather than writing it', async () => {
    const handle = createApi({ root: freshRoot() })
    const response = (await call(handle, 'PUT', '/api/patches/one', 'not json at all'))!
    expect(response.status).toBe(400)
    expect((await call(handle, 'GET', '/api/patches/one'))!.status).toBe(404)
  })

  test('refuses a name that could leave the folder', async () => {
    const root = freshRoot()
    const handle = createApi({ root })
    /* An encoded slash survives URL parsing, so it reaches the handler as one
       path segment and has to be caught by the name check. */
    for (const path of ['/api/patches/..%2F..%2Fescape', '/api/presets/..%2Fescape']) {
      expect((await call(handle, 'PUT', path, { gotcha: true }))!.status).toBe(400)
    }
    expect(readdirSync(root)).toEqual([])
  })

  test('says which methods a route has', async () => {
    const handle = createApi({ root: freshRoot() })
    expect((await call(handle, 'POST', '/api/patches'))!.status).toBe(405)
    expect((await call(handle, 'POST', '/api/patches/one'))!.status).toBe(405)
    expect((await call(handle, 'GET', '/api/presets/one'))!.status).toBe(405)
    expect((await call(handle, 'POST', '/api/presets'))!.status).toBe(405)
  })

  test('reports a storage failure as one, with a reason', async () => {
    /* The same shape as a full disk or an unmounted volume. */
    const root = freshRoot()
    writeFileSync(join(root, 'patches'), 'in the way', 'utf8')

    const response = (await createApi({ root })(
      new Request('http://test/api/patches/one', {
        method: 'PUT',
        body: JSON.stringify({ name: 'One' }),
      }),
    ))!
    expect(response.status).toBe(500)
    expect((await response.json()).error).toBeTruthy()
  })
})

describe('seeding', () => {
  test('does nothing when there is no bank to seed from', async () => {
    const root = freshRoot()
    const result = await seedPresets(join(root, 'no-such-bank'), join(root, 'active'))
    expect(result).toEqual({ seeded: [], skipped: 0 })
  })

  test('a manifest edited into nonsense seeds again rather than refusing to run', async () => {
    /* Unreadable means "nothing seeded here"; files present are still kept. */
    const root = freshRoot()
    const bank = join(root, 'bank')
    const active = join(root, 'active')
    mkdirSync(bank, { recursive: true })
    await writeFile(join(bank, 'one.json'), '{"slug":"one"}', 'utf8')

    expect((await seedPresets(bank, active)).seeded).toEqual(['one'])
    await writeFile(join(active, 'one.json'), '{"slug":"one","name":"Mine"}', 'utf8')
    await writeFile(join(active, '.seeded.json'), 'not json', 'utf8')

    const again = await seedPresets(bank, active)
    expect(again.seeded).toEqual([])
    expect(JSON.parse(await readFile(join(active, 'one.json'), 'utf8')).name).toBe('Mine')
  })
})
