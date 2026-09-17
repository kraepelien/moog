/* Who is asking. A signed cookie rather than a session table, because every
   deploy restarts the container and a restart must not sign everybody out.

   `crypto.subtle` rather than Bun's synchronous hasher: the dev server and the
   standalone server must behave identically, and `subtle.verify` compares in
   constant time. */

export const SESSION_COOKIE = 'moog_session'
const LOCAL_USER = 'local'

export interface AuthConfig {
  /* `off` until an OAuth client is configured: dev and the test suite need no
     credentials, and every request is the same local user. */
  readonly mode: 'off' | 'oauth'
  readonly secret: string
  readonly sessionDays: number
  readonly admins: readonly string[]
  readonly publicOrigin: string | null
  readonly localUser: string
  readonly clientId: string
  readonly clientSecret: string
}

export function authConfigFromEnv(env: Record<string, string | undefined>): AuthConfig {
  const mode = env.MOOG_OAUTH_CLIENT_ID ? 'oauth' : 'off'
  const secret = env.MOOG_SESSION_SECRET ?? ''
  if (mode === 'oauth' && secret === '') {
    throw new Error('MOOG_SESSION_SECRET is required once MOOG_OAUTH_CLIENT_ID is set')
  }
  return {
    mode,
    secret,
    sessionDays: Number(env.MOOG_SESSION_DAYS ?? 30),
    admins: (env.MOOG_ADMINS ?? '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
    publicOrigin: env.MOOG_PUBLIC_ORIGIN ?? null,
    localUser: LOCAL_USER,
    clientId: env.MOOG_OAUTH_CLIENT_ID ?? '',
    clientSecret: env.MOOG_OAUTH_CLIENT_SECRET ?? '',
  }
}

/* Hostnames that can only be the machine the browser is running on. */
export function isLoopback(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host === '::1' || host === '[::1]') return true
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
}

/* The origin this server answers as, which is what a redirect back to itself has
   to be built from.

   Not the request's own Host in general: Google matches the redirect URI exactly
   against what is registered, and a forged Host must not steer where the code is
   delivered.

   A loopback request is the exception, and answers for itself. It can only have
   come from the machine the browser is on, so there is nobody else to steer it
   towards — and locally the port is whichever was free when the tree started, so
   a single configured origin would sign you out of every worktree but one. */
export function originOf(config: AuthConfig, request: Request): string {
  const own = new URL(request.url)
  if (isLoopback(own.hostname)) return own.origin
  return config.publicOrigin ?? own.origin
}

/* Said out loud at startup, because the two modes look the same from outside:
   with no client id the app signs nobody in and hands everything to one local
   user, which is indistinguishable from a .env the server never read. */
export function describeAuth(config: AuthConfig): string {
  if (config.mode === 'off') {
    return 'off — everything belongs to the local user (MOOG_OAUTH_CLIENT_ID is unset)'
  }
  return `Google${config.admins.length > 0 ? `, ${config.admins.length} admin(s)` : ''}`
}

const encoder = new TextEncoder()

const toBase64Url = (bytes: ArrayBuffer | Uint8Array): string =>
  Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
    .toString('base64url')

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

export async function signToken(payload: object, secret: string): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)))
  const signature = await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(body))
  return `${body}.${toBase64Url(signature)}`
}

export async function readToken<T>(token: string, secret: string, now: number): Promise<T | null> {
  const [body, signature] = token.split('.')
  if (!body || !signature) return null

  const valid = await crypto.subtle.verify(
    'HMAC',
    await key(secret),
    Buffer.from(signature, 'base64url'),
    encoder.encode(body),
  )
  if (!valid) return null

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (typeof payload?.exp === 'number' && payload.exp * 1000 < now) return null
    return payload as T
  } catch {
    return null
  }
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=')
  }
  return null
}

/* Traefik sets x-forwarded-proto. Forging it only earns the forger a cookie
   their own plain-http browser then refuses to send back. */
export function isSecureRequest(request: Request): boolean {
  const forwarded = request.headers.get('x-forwarded-proto')
  if (forwarded) return forwarded.split(',')[0]!.trim() === 'https'
  return new URL(request.url).protocol === 'https:'
}

function attributes(request: Request): string {
  const flags = ['Path=/', 'HttpOnly', 'SameSite=Lax']
  /* No Domain, ever: a host-only cookie cannot be sent anywhere but the origin
     that set it. */
  if (isSecureRequest(request)) flags.push('Secure')
  return flags.join('; ')
}

export async function sessionCookie(
  user: string,
  config: AuthConfig,
  request: Request,
  now: number,
): Promise<string> {
  const exp = Math.floor(now / 1000) + config.sessionDays * 24 * 60 * 60
  const token = await signToken({ u: user, exp }, config.secret)
  const maxAge = config.sessionDays * 24 * 60 * 60
  return `${SESSION_COOKIE}=${token}; ${attributes(request)}; Max-Age=${maxAge}`
}

export function clearedSessionCookie(request: Request): string {
  return `${SESSION_COOKIE}=; ${attributes(request)}; Max-Age=0`
}

export async function whoAmI(
  request: Request,
  config: AuthConfig,
  now: number = Date.now(),
): Promise<string | null> {
  if (config.mode === 'off') return config.localUser

  const token = readCookie(request, SESSION_COOKIE)
  if (!token) return null
  const payload = await readToken<{ u?: unknown }>(token, config.secret, now)
  return typeof payload?.u === 'string' ? payload.u : null
}

export function isAdmin(email: string | null, config: AuthConfig): boolean {
  if (config.mode === 'off') return true
  return email !== null && config.admins.includes(email.toLowerCase())
}
