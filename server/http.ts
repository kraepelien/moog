import { originOf, type AuthConfig } from './identity.ts'

/* Every answer differs per viewer, so none of them may be cached by anything in
   between, and any cache that keys on the URL alone must be told the cookie
   matters. */
const JSON_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'private, no-store',
  vary: 'Cookie',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

export function notFound(): Response {
  return json({ error: 'not found' }, 404)
}

export function methodNotAllowed(): Response {
  return json({ error: 'method not allowed' }, 405)
}

export function badRequest(error: string): Response {
  return json({ error }, 400)
}

/* SameSite=Lax already keeps another site's form from reaching a PUT here with
   the cookie attached; this closes what is left, and costs one header read. */
export function fromElsewhere(request: Request, config: AuthConfig): boolean {
  const origin = request.headers.get('origin')
  if (origin === null) return false
  if (origin === originOf(config, request)) return false
  return origin !== new URL(request.url).origin
}

export async function readBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}
