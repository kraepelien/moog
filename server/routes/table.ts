import type { Privilege } from '@access/privileges.ts'
import { json, methodNotAllowed, notFound } from '@server/http.ts'
import type { Viewer } from '@server/services/access.ts'
import type { Services } from '@server/services/index.ts'

/* The routes, and the guard in front of them.

   A table rather than a run of `if (resource === ...)`: what a route needs is
   then declared next to the route instead of being the first few lines of its
   handler, and the check happens here for every entry at once. A route that
   forgets to ask cannot exist, because asking is not the handler's job. */

export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface RouteContext {
  readonly request: Request
  readonly url: URL
  readonly params: Readonly<Record<string, string>>
  /* Null only where the route said `open`; everywhere else the guard has
     already refused, so a handler never checks for one. */
  readonly viewer: Viewer
  readonly services: Services
}

export interface OpenRouteContext extends Omit<RouteContext, 'viewer'> {
  readonly viewer: Viewer | null
}

export interface Route {
  readonly method: Method
  /* Segments, with `:name` capturing one. */
  readonly path: string
  /* Reachable signed out. The default is that a route is not. */
  readonly open?: boolean
  readonly needs?: Privilege
  readonly handle: (context: never) => Response | Promise<Response>
}

export interface GuardedRoute extends Route {
  readonly open?: false
  readonly handle: (context: RouteContext) => Response | Promise<Response>
}

export interface OpenRoute extends Route {
  readonly open: true
  readonly handle: (context: OpenRouteContext) => Response | Promise<Response>
}

export function route(entry: GuardedRoute): Route
export function route(entry: OpenRoute): Route
export function route(entry: GuardedRoute | OpenRoute): Route {
  return entry as Route
}

function match(pattern: string, segments: readonly string[]): Record<string, string> | null {
  const wanted = pattern.split('/').filter(Boolean)
  if (wanted.length !== segments.length) return null

  const params: Record<string, string> = {}
  for (const [index, part] of wanted.entries()) {
    const given = segments[index]!
    if (part.startsWith(':')) {
      params[part.slice(1)] = given
      continue
    }
    if (part !== given) return null
  }
  return params
}

export interface Dispatch {
  readonly routes: readonly Route[]
  readonly services: Services
}

/* 404 for a path nothing declares, 405 for one that exists at another method —
   which is why the path is matched across every route before the method is
   looked at. */
export async function dispatch(
  { routes, services }: Dispatch,
  request: Request,
  url: URL,
  segments: readonly string[],
  viewer: Viewer | null,
): Promise<Response> {
  const method = request.method.toUpperCase()
  let pathMatched = false

  for (const entry of routes) {
    const params = match(entry.path, segments)
    if (params === null) continue
    pathMatched = true
    if (entry.method !== method) continue

    if (!entry.open && viewer === null) return json({ error: 'sign in' }, 401)
    if (entry.needs !== undefined && !(viewer?.can(entry.needs) ?? false)) {
      return json({ error: 'not allowed' }, 403)
    }

    const context = { request, url, params, viewer, services }
    return await (entry.handle as (given: typeof context) => Response | Promise<Response>)(context)
  }

  return pathMatched ? methodNotAllowed() : notFound()
}
