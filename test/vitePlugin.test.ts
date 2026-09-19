import { describe, expect, test } from 'bun:test'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { join, sep } from 'node:path'
import type { ViteDevServer } from 'vite'
import { send, toRequest, watchServerSources } from '@server/vitePlugin.ts'

/* Everything this bridge gets wrong is visible only in dev, which is the worst
   way round. */

function nodeRequest(
  options: {
    url?: string
    method?: string
    headers?: Record<string, string | string[]>
    body?: string
    encrypted?: boolean
  } = {},
): IncomingMessage {
  const stream = Readable.from(options.body === undefined ? [] : [Buffer.from(options.body)])
  return Object.assign(stream, {
    url: options.url ?? '/',
    method: options.method ?? 'GET',
    headers: { host: 'patchmemory.app', ...options.headers },
    socket: { encrypted: options.encrypted ?? false },
  }) as unknown as IncomingMessage
}

function nodeResponse() {
  const headers = new Map<string, string | string[]>()
  const res = {
    statusCode: 0,
    setHeader(name: string, value: string | string[]) {
      headers.set(name.toLowerCase(), value)
    },
    ended: undefined as Buffer | undefined,
    end(chunk?: Buffer) {
      res.ended = chunk
    },
  }
  return { res: res as unknown as ServerResponse, headers, read: () => res }
}

describe('a request crossing the bridge', () => {
  test('keeps the host it actually arrived on', () => {
    const request = toRequest(nodeRequest({ url: '/api/patches', headers: { host: 'nas:10072' } }))
    expect(new URL(request.url).host).toBe('nas:10072')
  })

  test('knows an encrypted socket from a plain one', () => {
    expect(new URL(toRequest(nodeRequest()).url).protocol).toBe('http:')
    expect(new URL(toRequest(nodeRequest({ encrypted: true })).url).protocol).toBe('https:')
  })

  test('carries its cookies', () => {
    const request = toRequest(nodeRequest({ headers: { cookie: 'pm_session=abc; other=1' } }))
    expect(request.headers.get('cookie')).toBe('pm_session=abc; other=1')
  })

  test('keeps a header that was sent more than once', () => {
    const request = toRequest(nodeRequest({ headers: { 'x-thing': ['one', 'two'] } }))
    expect(request.headers.get('x-thing')).toBe('one, two')
  })

  test('hands the body over without reading it', async () => {
    /* A request the handler declines has to reach Vite with its body intact. */
    const request = toRequest(nodeRequest({ method: 'PUT', body: '{"name":"Sub Bass"}' }))
    expect(request.bodyUsed).toBe(false)
    expect(await request.json()).toEqual({ name: 'Sub Bass' })
  })

  test('a GET has no body to hand over', () => {
    expect(toRequest(nodeRequest({ method: 'GET' })).body).toBeNull()
  })
})

describe('a response crossing back', () => {
  test('carries every Set-Cookie separately', async () => {
    /* `Headers.forEach` joins these with a comma and loses all but the first. */
    const response = new Response('{}', {
      headers: [
        ['set-cookie', 'pm_oauth=; Max-Age=0'],
        ['set-cookie', 'pm_session=abc; HttpOnly'],
        ['content-type', 'application/json'],
      ],
    })

    const { res, headers } = nodeResponse()
    await send(res, response)

    expect(headers.get('set-cookie')).toEqual(['pm_oauth=; Max-Age=0', 'pm_session=abc; HttpOnly'])
    expect(headers.get('content-type')).toBe('application/json')
  })

  test('sets no cookie header when there are none', async () => {
    const { res, headers } = nodeResponse()
    await send(res, new Response('{}', { headers: { 'content-type': 'application/json' } }))
    expect(headers.has('set-cookie')).toBe(false)
  })

  test('passes the status and the body through', async () => {
    const { res, headers, read } = nodeResponse()
    await send(res, new Response('{"error":"nope"}', { status: 418 }))
    expect(read().statusCode).toBe(418)
    expect(read().ended?.toString()).toBe('{"error":"nope"}')
    expect(headers.has('set-cookie')).toBe(false)
  })
})

/* A file under `server/` changing is the one thing the dev server cannot act on
   by itself, so the least it can do is say so. */
describe('server sources changing under a running dev server', () => {
  function fakeServer(root: string) {
    const added: string[] = []
    const warnings: string[] = []
    let onChange = (_file: string) => {}
    const server = {
      config: { root, logger: { warn: (line: string) => warnings.push(line) } },
      watcher: {
        add: (path: string) => added.push(path),
        on: (event: string, handler: (file: string) => void) => {
          if (event === 'change') onChange = handler
        },
      },
    } as unknown as ViteDevServer
    return { server, added, warnings, change: (file: string) => onChange(file) }
  }

  test('watches the directory Vite has no reason to', () => {
    const { server, added } = fakeServer('/repo')
    watchServerSources(server)
    expect(added).toEqual([join('/repo', 'server') + sep])
  })

  test('names the file and what to do about it', () => {
    const { server, warnings, change } = fakeServer('/repo')
    watchServerSources(server)
    change(join('/repo', 'server', 'routes', 'misc.ts'))
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain(join('server', 'routes', 'misc.ts'))
    expect(warnings[0]).toContain('bun run dev')
  })

  /* The separator is part of the prefix: without it a sibling whose name merely
     starts with `server` would warn too. */
  test('stays quiet for everything else', () => {
    const { server, warnings, change } = fakeServer('/repo')
    watchServerSources(server)
    change(join('/repo', 'src', 'App.tsx'))
    change(join('/repo', 'server-notes.md'))
    expect(warnings).toEqual([])
  })
})
