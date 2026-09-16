/* Signing in with Google, with `fetch` and `crypto.subtle` and nothing else.

   The code-for-token exchange is server-to-server, so the client secret never
   reaches a browser and neither does the token: what comes back to the browser
   is a session cookie it cannot read. */

export interface ProviderProfile {
  readonly subject: string
  readonly email: string | null
  readonly name: string | null
  readonly picture: string | null
}

export interface Provider {
  readonly id: string
  readonly authorizeUrl: string
  readonly tokenUrl: string
  readonly scope: string
  profileFrom(token: TokenResponse): ProviderProfile | null
}

export interface TokenResponse {
  readonly id_token?: string
  readonly access_token?: string
}

const base64url = (bytes: ArrayBuffer | Uint8Array): string =>
  Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString('base64url')

/* The payload only. It arrived over TLS from the token endpoint rather than
   through the browser, so the channel is what authenticates it — verifying the
   signature would mean fetching and caching Google's keys to learn nothing
   more. (OIDC 3.1.3.7, note 2.) */
function claimsOf(idToken: string): Record<string, unknown> | null {
  const payload = idToken.split('.')[1]
  if (!payload) return null
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

export const google: Provider = {
  id: 'google',
  authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  scope: 'openid email profile',
  profileFrom(token) {
    const claims = token.id_token === undefined ? null : claimsOf(token.id_token)
    const subject = claims?.sub
    if (typeof subject !== 'string' || subject === '') return null
    return {
      subject,
      email: typeof claims?.email === 'string' ? claims.email : null,
      name: typeof claims?.name === 'string' ? claims.name : null,
      picture: typeof claims?.picture === 'string' ? claims.picture : null,
    }
  },
}

export function providerById(id: string): Provider | null {
  return id === google.id ? google : null
}

export async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return { verifier, challenge: base64url(digest) }
}

/* Deterministic, so the same account always lands on the same row, and safe as
   a name wherever one is needed. The provider's own subject stays in the user
   record rather than becoming an identifier this app hands around. */
export async function userIdFor(provider: string, subject: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${provider}:${subject}`),
  )
  return `${provider}-${Buffer.from(digest).toString('hex').slice(0, 16)}`
}

/* Only a path of our own, so a crafted `returnTo` cannot send someone to
   another site carrying whatever the page shows. `//evil.example` is a URL, not
   a path, which is the case worth being explicit about. */
export function safeReturnTo(raw: string | null): string {
  if (raw === null || !raw.startsWith('/') || raw.startsWith('//')) return '/'
  return raw
}

export interface ExchangeOptions {
  readonly provider: Provider
  readonly code: string
  readonly verifier: string
  readonly clientId: string
  readonly clientSecret: string
  readonly redirectUri: string
  readonly doFetch?: typeof fetch
}

export async function exchangeCode(options: ExchangeOptions): Promise<ProviderProfile | null> {
  const doFetch = options.doFetch ?? fetch
  const response = await doFetch(options.provider.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: options.code,
      code_verifier: options.verifier,
      client_id: options.clientId,
      client_secret: options.clientSecret,
      redirect_uri: options.redirectUri,
    }),
  })
  if (!response.ok) return null

  try {
    return options.provider.profileFrom((await response.json()) as TokenResponse)
  } catch {
    return null
  }
}
