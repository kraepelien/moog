import { describe, expect, test } from 'bun:test'
import { createHttpStore, requestWith } from '../src/storage/httpStore.ts'
import { StoreError } from '../src/storage/types.ts'
import { createPatch } from '../src/patch/schema.ts'
import { fixedIdentity } from './fixtures.ts'

/* What the browser makes of the server's answers. */

interface Call {
  readonly path: string
  readonly init: RequestInit | undefined
}

function storeAnswering(reply: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = []
  const store = createHttpStore((path, init) => {
    const call = { path, init }
    calls.push(call)
    return Promise.resolve(reply(call))
  })
  return { store, calls }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('what the server says, and what the app hears', () => {
  test('401 means sign in, not storage failed', async () => {
    const { store } = storeAnswering(() => json({ error: 'sign in' }, 401))
    expect(store.list()).rejects.toMatchObject({ kind: 'unauthenticated' })
  })

  test('403 means it belongs to someone else', async () => {
    const { store } = storeAnswering(() => json({ error: 'not yours' }, 403))
    expect(store.delete('theirs')).rejects.toMatchObject({ kind: 'forbidden' })
  })

  test('404 is not a failure at all — there is simply nothing there', async () => {
    const { store } = storeAnswering(() => json({ error: 'not found' }, 404))
    expect(await store.get('never-saved')).toBeNull()
  })

  test('anything else is a storage failure, carrying what the server said', async () => {
    const { store } = storeAnswering(() => new Response('disk is full', { status: 500 }))
    const failure = await store.list().catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(StoreError)
    expect((failure as StoreError).kind).toBe('io')
    expect((failure as StoreError).message).toContain('disk is full')
  })

  test('a server that is not answering is its own kind of failure', async () => {
    const { store } = storeAnswering(() => {
      throw new TypeError('Failed to fetch')
    })
    expect(store.list()).rejects.toMatchObject({ kind: 'unavailable' })
  })

  test('a 200 that is not JSON is reported as such, not as a parse error', async () => {
    const { store } = storeAnswering(() => new Response('<!doctype html><html>', { status: 200 }))
    const failure = await store.list().catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(StoreError)
    expect((failure as StoreError).message).toMatch(/not JSON/)
  })
})

describe('what the app sends', () => {
  test('a header a caller passes survives alongside the default', async () => {
    /* It did not: `headers` was written after the spread. */
    let sent: Headers | undefined
    await requestWith(
      (_path, init) => {
        sent = new Headers(init?.headers)
        return Promise.resolve(json({}))
      },
      '/patches/one',
      { method: 'PUT', body: '{}', headers: { 'x-thing': 'kept' } },
    )

    expect(sent?.get('x-thing')).toBe('kept')
    expect(sent?.get('content-type')).toBe('application/json')
  })

  test('a body is sent as JSON', async () => {
    const { store, calls } = storeAnswering(() => json({}))
    await store.save(createPatch({ name: 'Two' }, fixedIdentity()))

    expect(calls[0]!.init?.method).toBe('PUT')
    expect(JSON.parse(String(calls[0]!.init?.body)).name).toBe('Two')
  })

  test('the session rides along, because the request is same-origin', async () => {
    const { store, calls } = storeAnswering(() => json([]))
    await store.list()
    expect(calls[0]!.init?.credentials).toBe('same-origin')
  })
})
