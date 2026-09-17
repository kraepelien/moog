import type { Database } from 'bun:sqlite'
import {
  clearedSessionCookie,
  originOf,
  readCookie,
  readToken,
  sessionCookie,
  signToken,
  type AuthConfig,
} from '@server/identity.ts'
import {
  exchangeCode,
  pkcePair,
  providerById,
  safeReturnTo,
  userIdFor,
} from '@server/oauth.ts'
import { createUsers } from '@server/repositories/users.ts'

/* Everything under /api/, which is the only prefix the dev bridge forwards:
   an auth route anywhere else would work deployed and fall through to the app
   in development. */

const FLOW_COOKIE = 'moog_oauth'
const FLOW_MINUTES = 10

export interface AuthOptions {
  readonly db: Database
  readonly config: AuthConfig
  readonly clientId: string
  readonly clientSecret: string
  readonly doFetch?: typeof fetch
  readonly now?: () => number
}


interface Flow {
  readonly state: string
  readonly verifier: string
  readonly returnTo: string
  readonly exp: number
}

function redirect(to: string, cookies: string[] = []): Response {
  const headers = new Headers({ location: to })
  for (const cookie of cookies) headers.append('set-cookie', cookie)
  return new Response(null, { status: 302, headers })
}

function redirectUri(config: AuthConfig, request: Request, provider: string): string {
  return `${originOf(config, request)}/api/auth/${provider}/callback`
}

export async function handleAuth(
  request: Request,
  options: AuthOptions,
  parts: { provider?: string; action?: string },
): Promise<Response> {
  const { config } = options
  const url = new URL(request.url)
  const method = request.method.toUpperCase()

  if (parts.provider === 'signout') {
    if (method !== 'POST') return json({ error: 'method not allowed' }, 405)
    return new Response(null, {
      status: 204,
      headers: { 'set-cookie': clearedSessionCookie(request) },
    })
  }

  const provider = providerById(parts.provider ?? '')
  if (!provider) return json({ error: 'not found' }, 404)
  if (config.mode !== 'oauth') return json({ error: 'sign-in is not configured' }, 404)

  const now = options.now ?? Date.now

  if (parts.action === 'start') {
    const { verifier, challenge } = await pkcePair()
    const state = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url')
    /* State and verifier ride in a signed cookie rather than server memory, so
       a deploy in the middle of a sign-in strands nobody. */
    const flow = await signToken(
      {
        state,
        verifier,
        returnTo: safeReturnTo(url.searchParams.get('returnTo')),
        exp: Math.floor(now() / 1000) + FLOW_MINUTES * 60,
      },
      config.secret,
    )

    const authorize = new URL(provider.authorizeUrl)
    authorize.searchParams.set('client_id', options.clientId)
    authorize.searchParams.set('redirect_uri', redirectUri(config, request, provider.id))
    authorize.searchParams.set('response_type', 'code')
    authorize.searchParams.set('scope', provider.scope)
    authorize.searchParams.set('state', state)
    authorize.searchParams.set('code_challenge', challenge)
    authorize.searchParams.set('code_challenge_method', 'S256')

    return redirect(authorize.toString(), [
      `${FLOW_COOKIE}=${flow}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=${FLOW_MINUTES * 60}`,
    ])
  }

  if (parts.action === 'callback') {
    const token = readCookie(request, FLOW_COOKIE)
    const flow = token === null ? null : await readToken<Flow>(token, config.secret, now())
    /* A refusal is a redirect rather than a 500: whatever went wrong, the
       person is in a browser and needs somewhere to land. */
    if (!flow) return redirect('/signed-out?error=expired')
    if (url.searchParams.get('state') !== flow.state) {
      return redirect('/signed-out?error=state')
    }

    const code = url.searchParams.get('code')
    if (code === null) return redirect('/signed-out?error=refused')

    const profile = await exchangeCode({
      provider,
      code,
      verifier: flow.verifier,
      clientId: options.clientId,
      clientSecret: options.clientSecret,
      redirectUri: redirectUri(config, request, provider.id),
      doFetch: options.doFetch,
    })
    if (!profile) return redirect('/signed-out?error=exchange')

    const uid = await userIdFor(provider.id, profile.subject)
    /* A member, always. Whether they are also an admin is decided per request
       from MOOG_ADMINS and from what has been granted, not here. */
    createUsers(options.db).ensure({
      uid,
      provider: provider.id,
      subject: profile.subject,
      email: profile.email,
      displayName: profile.name,
      avatarUrl: profile.picture,
    })

    return redirect(flow.returnTo, [
      await sessionCookie(uid, config, request, now()),
      `${FLOW_COOKIE}=; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=0`,
    ])
  }

  return json({ error: 'not found' }, 404)
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
  })
}
