import { describe, expect, test } from 'bun:test'
import { authConfigFromEnv, isLoopback, originOf } from '../server/identity.ts'

/* Which origin the server answers as decides where a sign-in comes back to. A
   deployment must use the one that was registered, because a forged Host must
   not steer where the code is delivered; a local tree must use its own, because
   its port is whichever was free when it started. */

const deployed = authConfigFromEnv({
  MOOG_OAUTH_CLIENT_ID: 'client',
  MOOG_SESSION_SECRET: 'secret',
  MOOG_PUBLIC_ORIGIN: 'https://moog.example',
})

const at = (url: string) => new Request(url)

describe('what counts as this machine', () => {
  test.each([
    ['localhost', true],
    ['moog.localhost', true],
    ['127.0.0.1', true],
    ['127.1.2.3', true],
    ['::1', true],
    ['[::1]', true],
    ['moog.example', false],
    ['notlocalhost', false],
    ['localhost.evil.example', false],
    ['1270.0.1', false],
  ])('%s → %p', (host, expected) => {
    expect(isLoopback(host)).toBe(expected)
  })
})

describe('a deployment', () => {
  test('answers as the origin it was told about', () => {
    expect(originOf(deployed, at('https://moog.example/api/auth/google/start'))).toBe(
      'https://moog.example',
    )
  })

  /* The reason the configured origin exists: behind a proxy the request's own
     Host is whatever was forwarded, and a forged one must not be believed. */
  test('ignores a forged Host', () => {
    expect(originOf(deployed, at('https://evil.example/api/auth/google/start'))).toBe(
      'https://moog.example',
    )
  })
})

describe('a local tree', () => {
  /* The whole point: several worktrees run at once and Vite takes the next free
     port, so the configured origin must not drag every one of them back to the
     first — or to production, which is what .env carries. */
  test.each(['http://localhost:5173', 'http://localhost:5182', 'http://127.0.0.1:5199'])(
    'answers as itself at %s',
    (origin) => {
      expect(originOf(deployed, at(`${origin}/api/auth/google/start`))).toBe(origin)
    },
  )

  test('answers as itself with nothing configured at all', () => {
    const off = authConfigFromEnv({})
    expect(originOf(off, at('http://localhost:5181/api/auth/google/start'))).toBe(
      'http://localhost:5181',
    )
  })
})
