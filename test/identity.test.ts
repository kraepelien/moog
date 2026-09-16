import { describe, expect, test } from 'bun:test'
import {
  SESSION_COOKIE,
  authConfigFromEnv,
  clearedSessionCookie,
  isAdmin,
  isSecureRequest,
  readCookie,
  readToken,
  sessionCookie,
  signToken,
  whoAmI,
} from '../server/identity.ts'

const SECRET = 'a-test-secret'
const NOW = Date.UTC(2026, 8, 16, 12, 0, 0)

const config = (over: Partial<ReturnType<typeof authConfigFromEnv>> = {}) => ({
  ...authConfigFromEnv({ MOOG_SESSION_SECRET: SECRET }),
  secret: SECRET,
  ...over,
})

describe('a session token', () => {
  test('round-trips what was signed', async () => {
    const token = await signToken({ u: 'google-abc', exp: NOW / 1000 + 60 }, SECRET)
    expect(await readToken<{ u: string }>(token, SECRET, NOW)).toMatchObject({ u: 'google-abc' })
  })

  test('is refused with a byte changed', async () => {
    const token = await signToken({ u: 'google-abc', exp: NOW / 1000 + 60 }, SECRET)
    const [body, signature] = token.split('.')
    const tampered = `${body!.slice(0, -1)}${body!.endsWith('A') ? 'B' : 'A'}.${signature}`
    expect(await readToken(tampered, SECRET, NOW)).toBeNull()
  })

  test('is refused once it has expired', async () => {
    const token = await signToken({ u: 'google-abc', exp: NOW / 1000 - 1 }, SECRET)
    expect(await readToken(token, SECRET, NOW)).toBeNull()
  })

  test('is refused when it was signed with another secret', async () => {
    const token = await signToken({ u: 'google-abc', exp: NOW / 1000 + 60 }, 'somebody-elses')
    expect(await readToken(token, SECRET, NOW)).toBeNull()
  })

  test('is refused when it is not a token at all', async () => {
    for (const nonsense of ['', 'no-dot', 'a.b', '...']) {
      expect(await readToken(nonsense, SECRET, NOW)).toBeNull()
    }
  })
})

describe('the cookie carrying it', () => {
  test('is Secure behind Traefik and not over plain http', async () => {
    /* The same process answers on both, and a Secure cookie is dropped on the
       second. It decides per request rather than per deployment. */
    const secure = await sessionCookie(
      'u',
      config(),
      new Request('http://nas:10072/', { headers: { 'x-forwarded-proto': 'https' } }),
      NOW,
    )
    const plain = await sessionCookie('u', config(), new Request('http://nas:10072/'), NOW)

    expect(secure).toContain('Secure')
    expect(plain).not.toContain('Secure')
  })

  test('is HttpOnly, SameSite=Lax, and never scoped to a domain', async () => {
    const cookie = await sessionCookie('u', config(), new Request('https://moog.example/'), NOW)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')
    expect(cookie).not.toContain('Domain')
  })

  test('clearing it expires it with the same attributes', () => {
    const cleared = clearedSessionCookie(new Request('https://moog.example/'))
    expect(cleared).toContain('Max-Age=0')
    expect(cleared).toContain('HttpOnly')
  })

  test('is found among others', () => {
    const request = new Request('https://moog.example/', {
      headers: { cookie: `other=1; ${SESSION_COOKIE}=abc.def; third=2` },
    })
    expect(readCookie(request, SESSION_COOKIE)).toBe('abc.def')
    expect(readCookie(request, 'missing')).toBeNull()
  })
})

describe('an https request', () => {
  test('is one Traefik says is, or one that plainly is', () => {
    const forwarded = new Request('http://nas/', { headers: { 'x-forwarded-proto': 'https' } })
    expect(isSecureRequest(forwarded)).toBe(true)
    expect(isSecureRequest(new Request('https://moog.example/'))).toBe(true)
    expect(isSecureRequest(new Request('http://nas/'))).toBe(false)
  })

  test('takes the first hop when the header lists several', () => {
    const chained = new Request('http://nas/', { headers: { 'x-forwarded-proto': 'https, http' } })
    expect(isSecureRequest(chained)).toBe(true)
  })
})

describe('with sign-in switched off', () => {
  test('every request is the same local user', async () => {
    const off = authConfigFromEnv({})
    expect(off.mode).toBe('off')
    expect(await whoAmI(new Request('http://x/'), off)).toBe('local')
  })

  test('a request without a cookie is nobody once it is switched on', async () => {
    const on = config({ mode: 'oauth' })
    expect(await whoAmI(new Request('http://x/'), on)).toBeNull()
  })

  test('a signed cookie says who it is', async () => {
    const on = config({ mode: 'oauth' })
    const cookie = await sessionCookie('google-abc', on, new Request('https://x/'), NOW)
    const request = new Request('https://x/', { headers: { cookie: cookie.split(';')[0]! } })
    expect(await whoAmI(request, on, NOW)).toBe('google-abc')
  })
})

describe('who is an admin', () => {
  test('is whoever the env says, compared without case', () => {
    const on = config({ mode: 'oauth', admins: ['peter@example.com'] })
    expect(isAdmin('Peter@Example.com', on)).toBe(true)
    expect(isAdmin('someone@example.com', on)).toBe(false)
    expect(isAdmin(null, on)).toBe(false)
  })

  test('is everyone while there is nobody to sign in as', () => {
    expect(isAdmin(null, authConfigFromEnv({}))).toBe(true)
  })
})

describe('configuration', () => {
  test('a client id without a secret is refused at startup', () => {
    /* Rather than issuing cookies signed with an empty string. */
    expect(() => authConfigFromEnv({ MOOG_OAUTH_CLIENT_ID: 'abc' })).toThrow(/SESSION_SECRET/)
  })

  test('admins are a comma-separated list, trimmed', () => {
    const parsed = authConfigFromEnv({ MOOG_ADMINS: ' one@x.com , two@x.com ,, ' })
    expect(parsed.admins).toEqual(['one@x.com', 'two@x.com'])
  })
})
