import { describe, expect, test } from 'bun:test'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { send, toRequest } from '@server/vitePlugin.ts'

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
    headers: { host: 'moog.pomello.se', ...options.headers },
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
    const request = toRequest(nodeRequest({ headers: { cookie: 'moog_session=abc; other=1' } }))
    expect(request.headers.get('cookie')).toBe('moog_session=abc; other=1')
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
        ['set-cookie', 'moog_oauth=; Max-Age=0'],
        ['set-cookie', 'moog_session=abc; HttpOnly'],
        ['content-type', 'application/json'],
      ],
    })

    const { res, headers } = nodeResponse()
    await send(res, response)

    expect(headers.get('set-cookie')).toEqual(['moog_oauth=; Max-Age=0', 'moog_session=abc; HttpOnly'])
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
