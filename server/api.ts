import type { Database } from 'bun:sqlite'
import { systemIdentity } from '../src/patch/schema.ts'
import { authConfigFromEnv, isAdmin, originOf, whoAmI, type AuthConfig } from './identity.ts'
import { buildLibrary } from './library.ts'
import { callerKey, createRateLimiter, limitsFromEnv, type Limits } from './limits.ts'
import { handleAuth } from './routes/auth.ts'
import { handlePatches } from './routes/patches.ts'
import { createStore, type Store } from './store.ts'
import { addTag, listTags, listTagsInUse, removeTag } from './tags.ts'
import { tagNameProblem } from '../src/admin/tags.ts'
import { ensureLocalUser, findUser, type UserRow } from './users.ts'

/* One request handler, shared by the Vite dev plugin and the standalone server,
   so development and production cannot drift into answering differently.

   A write is validated here rather than at the store: the columns are typed
   now, so anything that is not a patch has to be refused before it is one. */

/* Every answer differs per viewer now, so none of them may be cached by
   anything in between, and any cache that keys on the URL alone must be told
   the cookie matters. */
const JSON_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'private, no-store',
  vary: 'Cookie',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

function notFound(): Response {
  return json({ error: 'not found' }, 404)
}

/* SameSite=Lax already keeps another site's form from reaching a PUT here with
   the cookie attached; this closes what is left, and costs one header read. */
function fromElsewhere(request: Request, config: AuthConfig): boolean {
  const origin = request.headers.get('origin')
  if (origin === null) return false
  if (origin === originOf(config, request)) return false
  return origin !== new URL(request.url).origin
}

async function body(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

export interface ApiOptions {
  readonly db: Database
  readonly config?: AuthConfig
  readonly limits?: Limits
  /* Injected so the token exchange can be driven without a network. */
  readonly doFetch?: typeof fetch
  readonly now?: () => number
}

export function createApi({
  db,
  config = authConfigFromEnv(process.env),
  limits = limitsFromEnv(process.env),
  doFetch,
  now,
}: ApiOptions): (request: Request) => Promise<Response | null> {
  const store: Store = createStore(db)
  if (config.mode === 'off') ensureLocalUser(db, config.localUser)

  const writes = createRateLimiter(limits.writesPerMinute, now)
  const signIns = createRateLimiter(limits.signInsPerMinute, now)

  const routeContext = (viewer: UserRow | null) => ({
    store,
    limits,
    viewer,
    admin: viewer !== null && isAdmin(viewer.email, config),
    json,
    body,
    newId: systemIdentity.newId,
    now: systemIdentity.now,
  })

  /* Returns null for anything that is not ours, so the caller can fall through
     to serving the app rather than 404ing every page load. */
  return async function handle(request: Request): Promise<Response | null> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return null

    const parts = url.pathname.slice('/api/'.length).split('/').filter(Boolean)
    const [resource, name, sub] = parts
    const method = request.method.toUpperCase()

    if (method !== 'GET' && method !== 'HEAD' && fromElsewhere(request, config)) {
      return json({ error: 'cross-site request' }, 403)
    }

    try {
      /* Inside the try: reading the session touches the database, and a failure
         there is a storage failure like any other rather than a crash. */
      const uid = await whoAmI(request, config)
      const viewer: UserRow | null = uid === null ? null : findUser(db, uid)

      /* Unauthenticated on purpose: the container's healthcheck calls it, and
         it asks the database a real question so an unmounted volume fails. */
      if (resource === 'health') {
        return json({ ok: true, patches: store.countPatches() })
      }

      /* Before the session is read, because signing in is what somebody
         without one does. */
      if (resource === 'auth') {
        if (sub === 'start' && !signIns.allow(callerKey(request, null))) {
          return json({ error: 'too many sign-in attempts, wait a minute' }, 429)
        }
        return handleAuth(
          request,
          {
            db,
            config,
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            doFetch,
            now,
          },
          { provider: name, action: sub },
        )
      }

      /* Always 200, never 401: it is how the app finds out whether it is
         signed in, so refusing it would leave nothing to ask. */
      if (resource === 'session') {
        return json({
          mode: config.mode,
          signedIn: viewer !== null,
          admin: viewer !== null && isAdmin(viewer.email, config),
          user:
            viewer === null
              ? null
              : { uid: viewer.uid, name: viewer.display_name, avatar: viewer.avatar_url },
        })
      }

      /* Ahead of every route that writes, so none of them can be reached
         without passing it. */
      if (method !== 'GET' && method !== 'HEAD') {
        /* Counted per person once there is one, and per address before that,
           so one runaway client cannot spend everybody's allowance. */
        if (!writes.allow(callerKey(request, viewer?.uid ?? null))) {
          return json({ error: 'too many writes, wait a minute' }, 429)
        }
      }

      /* Readable by anyone, because the save form needs it before it knows who
         is looking. Editing the list is the admin page's, and the counts go
         with it: they are over everybody's patches, private ones included. */
      if (resource === 'tags') {
        if (method === 'GET' && !url.searchParams.has('use')) return json(listTags(db))

        if (!viewer) return json({ error: 'sign in' }, 401)
        if (!isAdmin(viewer.email, config)) return json({ error: 'not an admin' }, 403)

        if (method === 'GET') return json(listTagsInUse(db))

        if (method === 'POST') {
          const payload = (await body(request)) as { name?: unknown } | null
          if (typeof payload?.name !== 'string') return json({ error: 'invalid body' }, 400)

          const added = addTag(db, payload.name)
          if (added === 'invalid') {
            return json({ error: tagNameProblem(payload.name) ?? 'invalid name' }, 400)
          }
          if (added === 'taken') return json({ error: 'that tag is already on the list' }, 409)
          return json(added, 201)
        }

        if (method === 'DELETE' && name) {
          const id = Number(name)
          if (!Number.isInteger(id)) return json({ error: 'invalid id' }, 400)
          if (!removeTag(db, id)) return notFound()
          return json({ removed: id })
        }

        return json({ error: 'method not allowed' }, 405)
      }

      if (resource === 'settings') {
        if (!viewer) return json({ error: 'sign in' }, 401)
        if (method === 'GET') return json(store.settingsOf(viewer.id))
        if (method === 'PUT') {
          const payload = await body(request)
          if (payload === null || typeof payload !== 'object') {
            return json({ error: 'invalid body' }, 400)
          }
          store.putSettings(viewer.id, payload)
          return json(payload)
        }
        return json({ error: 'method not allowed' }, 405)
      }

      if (resource === 'library') {
        if (!viewer) return json({ error: 'sign in' }, 401)
        if (method !== 'GET') return json({ error: 'method not allowed' }, 405)
        return json(buildLibrary(db, viewer.id, url.searchParams.get('instrument')))
      }

      if (resource === 'patches') {
        return handlePatches(request, routeContext(viewer), { name, sub })
      }

      /* The bank is read-only to every route: it comes from the image, and a
         change here would be overwritten at the next start. Saving one is
         always a copy, which is POST /api/patches. */
      if (resource === 'presets') {
        if (method !== 'GET') return json({ error: 'factory presets are read-only' }, 403)
        /* One of them is read through /api/patches, like anything else. */
        if (name) return notFound()
        return json(store.listPresets())
      }

      return notFound()
    } catch (error) {
      /* The browser adapter turns this into a StoreError, so a disk problem
         reaches the UI as a storage failure rather than as a parse error. */
      return json({ error: error instanceof Error ? error.message : 'storage failed' }, 500)
    }
  }
}
