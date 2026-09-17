import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApi } from '../server/api.ts'
import { openDatabase } from '../server/db.ts'
import { syncInstruments } from '../server/factory.ts'
import { authConfigFromEnv, SESSION_COOKIE } from '../server/identity.ts'
import { safeReturnTo, userIdFor } from '../server/oauth.ts'
import { createUsers } from '../server/repositories/users.ts'

/* The whole dance with a fake token endpoint: no network, and the client
   secret never leaves the server even here. */

const roots: string[] = []
const SECRET = 'oauth-test-secret'

function claims(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `header.${body}.signature`
}

function signIn(options: { token?: object; status?: number } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'moog-oauth-'))
  roots.push(root)
  const db = openDatabase(join(root, 'moog.db'))
  syncInstruments(db)

  const exchanges: { body: URLSearchParams }[] = []
  const doFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    exchanges.push({ body: new URLSearchParams(String(init?.body)) })
    return new Response(
      JSON.stringify(
        options.token ?? { id_token: claims({ sub: '1174', email: 'p@example.com', name: 'Peter' }) },
      ),
      { status: options.status ?? 200, headers: { 'content-type': 'application/json' } },
    )
  }) as unknown as typeof fetch

  const config = {
    ...authConfigFromEnv({
      MOOG_SESSION_SECRET: SECRET,
      MOOG_OAUTH_CLIENT_ID: 'client-abc',
      MOOG_OAUTH_CLIENT_SECRET: 'secret-xyz',
      MOOG_PUBLIC_ORIGIN: 'https://moog.example',
    }),
  }
  const handle = createApi({ db, config, doFetch })

  const call = (path: string, init: RequestInit = {}) =>
    handle(new Request(`https://moog.example${path}`, init))

  return { db, call, exchanges }
}

const cookiesFrom = (response: Response) => response.headers.getSetCookie()
const cookieNamed = (response: Response, name: string) =>
  cookiesFrom(response).find((cookie) => cookie.startsWith(`${name}=`))

async function start(call: ReturnType<typeof signIn>['call'], returnTo = '/#/library') {
  const response = (await call(`/api/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`))!
  const location = new URL(response.headers.get('location')!)
  const flow = cookieNamed(response, 'moog_oauth')!.split(';')[0]!
  return { response, location, flow, state: location.searchParams.get('state')! }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('starting a sign-in', () => {
  test('sends the browser to Google with PKCE and a state', async () => {
    const { call } = signIn()
    const { response, location } = await start(call)

    expect(response.status).toBe(302)
    expect(location.origin + location.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(location.searchParams.get('client_id')).toBe('client-abc')
    expect(location.searchParams.get('code_challenge_method')).toBe('S256')
    expect(location.searchParams.get('code_challenge')).toBeTruthy()
    expect(location.searchParams.get('state')).toBeTruthy()
  })

  test('asks for the redirect the console was told about, not the one in the request', async () => {
    /* Google matches it exactly, and a forged Host must not steer where the
       code is delivered. */
    const { call } = signIn()
    const { location } = await start(call)
    expect(location.searchParams.get('redirect_uri')).toBe(
      'https://moog.example/api/auth/google/callback',
    )
  })

  test('keeps the state and the verifier in a cookie, not in the server', async () => {
    const { response } = await start(signIn().call)
    const flow = cookieNamed(response, 'moog_oauth')!
    expect(flow).toContain('HttpOnly')
    expect(flow).toContain('Path=/api/auth')
    expect(flow).toContain('Max-Age=600')
  })
})

describe('coming back from Google', () => {
  test('signs the person in and remembers them', async () => {
    const { call, db } = signIn()
    const { flow, state } = await start(call)

    const back = (await call(`/api/auth/google/callback?code=abc&state=${state}`, {
      headers: { cookie: flow },
    }))!

    expect(back.status).toBe(302)
    expect(back.headers.get('location')).toBe('/#/library')
    expect(cookieNamed(back, SESSION_COOKIE)).toContain('HttpOnly')

    const uid = await userIdFor('google', '1174')
    expect(createUsers(db).find(uid)).toMatchObject({ email: 'p@example.com', display_name: 'Peter' })
  })

  test('clears the flow cookie as it sets the session', async () => {
    const { call } = signIn()
    const { flow, state } = await start(call)
    const back = (await call(`/api/auth/google/callback?code=abc&state=${state}`, {
      headers: { cookie: flow },
    }))!

    /* Two Set-Cookie headers in one response, which is the case the dev bridge
       used to flatten into nonsense. */
    expect(cookiesFrom(back)).toHaveLength(2)
    expect(cookieNamed(back, 'moog_oauth')).toContain('Max-Age=0')
  })

  test('sends the verifier that matches the challenge', async () => {
    const { call, exchanges } = signIn()
    const { flow, state } = await start(call)
    await call(`/api/auth/google/callback?code=abc&state=${state}`, { headers: { cookie: flow } })

    const sent = exchanges[0]!.body
    expect(sent.get('grant_type')).toBe('authorization_code')
    expect(sent.get('code')).toBe('abc')
    expect(sent.get('code_verifier')).toBeTruthy()
    expect(sent.get('client_secret')).toBe('secret-xyz')
  })

  test('refuses a state that does not match the one it issued', async () => {
    const { call } = signIn()
    const { flow } = await start(call)
    const back = (await call('/api/auth/google/callback?code=abc&state=somebody-elses', {
      headers: { cookie: flow },
    }))!

    expect(back.headers.get('location')).toContain('error=state')
    expect(cookieNamed(back, SESSION_COOKIE)).toBeUndefined()
  })

  test('refuses a callback with no flow cookie at all', async () => {
    const { call } = signIn()
    const back = (await call('/api/auth/google/callback?code=abc&state=anything'))!
    expect(back.headers.get('location')).toContain('error=expired')
    expect(cookieNamed(back, SESSION_COOKIE)).toBeUndefined()
  })

  test('refuses when the token endpoint does', async () => {
    const { call } = signIn({ status: 400 })
    const { flow, state } = await start(call)
    const back = (await call(`/api/auth/google/callback?code=abc&state=${state}`, {
      headers: { cookie: flow },
    }))!

    expect(back.status).toBe(302)
    expect(back.headers.get('location')).toContain('error=exchange')
  })

  test('refuses a token carrying no subject', async () => {
    const { call } = signIn({ token: { id_token: claims({ email: 'nobody@example.com' }) } })
    const { flow, state } = await start(call)
    const back = (await call(`/api/auth/google/callback?code=abc&state=${state}`, {
      headers: { cookie: flow },
    }))!
    expect(back.headers.get('location')).toContain('error=exchange')
  })

  test('the same account twice is one person', async () => {
    const { call, db } = signIn()
    for (let i = 0; i < 2; i++) {
      const { flow, state } = await start(call)
      await call(`/api/auth/google/callback?code=abc&state=${state}`, { headers: { cookie: flow } })
    }
    expect(db.query<{ n: number }, []>(`select count(*) as n from users`).get()?.n).toBe(1)
  })
})

describe('where sign-in sends you afterwards', () => {
  test('is a path of ours, never another site', async () => {
    expect(safeReturnTo('/#/library')).toBe('/#/library')
    expect(safeReturnTo('//evil.example')).toBe('/')
    expect(safeReturnTo('https://evil.example')).toBe('/')
    expect(safeReturnTo(null)).toBe('/')
  })

  test('so a crafted returnTo lands at home', async () => {
    const { call } = signIn()
    const { flow, state } = await start(call, '//evil.example')
    const back = (await call(`/api/auth/google/callback?code=abc&state=${state}`, {
      headers: { cookie: flow },
    }))!
    expect(back.headers.get('location')).toBe('/')
  })
})

describe('signing out', () => {
  test('expires the cookie', async () => {
    const { call } = signIn()
    const response = (await call('/api/auth/signout', { method: 'POST' }))!
    expect(response.status).toBe(204)
    expect(cookieNamed(response, SESSION_COOKIE)).toContain('Max-Age=0')
  })

  test('is a POST, so nothing can sign you out by linking to it', async () => {
    const { call } = signIn()
    expect((await call('/api/auth/signout'))!.status).toBe(405)
  })
})

describe('with sign-in unconfigured', () => {
  test('the routes are not there at all', async () => {
    const root = mkdtempSync(join(tmpdir(), 'moog-oauth-off-'))
    roots.push(root)
    const db = openDatabase(join(root, 'moog.db'))
    const handle = createApi({ db, config: authConfigFromEnv({}) })

    const response = (await handle(new Request('https://x/api/auth/google/start')))!
    expect(response.status).toBe(404)
  })
})
