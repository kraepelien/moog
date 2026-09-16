import type { Database } from 'bun:sqlite'
import { migrateToCurrent } from '../src/patch/migrate.ts'
import { authConfigFromEnv, isAdmin, whoAmI, type AuthConfig } from './identity.ts'
import { createStore, isSafeName, type Store } from './store.ts'
import { ensureLocalUser, findUser, type UserRow } from './users.ts'

/* One request handler, shared by the Vite dev plugin and the standalone server,
   so development and production cannot drift into answering differently.

   A write is validated here rather than at the store: the columns are typed
   now, so anything that is not a patch has to be refused before it is one. */

const JSON_HEADERS = { 'content-type': 'application/json' }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

function notFound(): Response {
  return json({ error: 'not found' }, 404)
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
}

export function createApi({
  db,
  config = authConfigFromEnv(process.env),
}: ApiOptions): (request: Request) => Promise<Response | null> {
  const store: Store = createStore(db)
  if (config.mode === 'off') ensureLocalUser(db, config.localUser)

  /* Returns null for anything that is not ours, so the caller can fall through
     to serving the app rather than 404ing every page load. */
  return async function handle(request: Request): Promise<Response | null> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return null

    const parts = url.pathname.slice('/api/'.length).split('/').filter(Boolean)
    const [resource, name, sub] = parts
    const method = request.method.toUpperCase()

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

      if (resource === 'patches') {
        if (!name) {
          if (method === 'GET') return json(store.listPatches())
          return json({ error: 'method not allowed' }, 405)
        }
        if (!isSafeName(name)) return json({ error: 'invalid id' }, 400)

        /* A rating is the viewer's, so it hangs off the patch's URL but never
           touches the patch. */
        if (sub === 'rating') {
          if (!viewer) return json({ error: 'sign in' }, 401)
          if (method !== 'PUT') return json({ error: 'method not allowed' }, 405)
          const payload = (await body(request)) as { stars?: unknown } | null
          const stars = payload?.stars
          if (typeof stars !== 'number' || !Number.isInteger(stars) || stars < 0 || stars > 5) {
            return json({ error: 'stars must be a whole number from 0 to 5' }, 400)
          }
          if (!store.setRating(viewer.id, name, stars)) return notFound()
          return json({ id: name, stars })
        }

        if (method === 'GET') {
          const patch = store.getPatch(name)
          return patch === null ? notFound() : json(patch)
        }
        if (method === 'PUT') {
          if (!viewer) return json({ error: 'sign in' }, 401)
          const parsed = migrateToCurrent(await body(request))
          if (!parsed.ok) return json({ error: parsed.error }, 400)
          store.putPatch(name, parsed.value, viewer.id)
          return json(parsed.value)
        }
        if (method === 'DELETE') {
          store.deletePatch(name)
          return json({ deleted: name })
        }
        return json({ error: 'method not allowed' }, 405)
      }

      if (resource === 'presets') {
        if (!name) {
          if (method === 'GET') return json(store.listPresets())
          return json({ error: 'method not allowed' }, 405)
        }
        if (!isSafeName(name)) return json({ error: 'invalid slug' }, 400)
        if (method === 'PUT') {
          const parsed = migrateToCurrent(await body(request))
          if (!parsed.ok) return json({ error: parsed.error }, 400)
          store.putPreset(name, parsed.value)
          return json(parsed.value)
        }
        if (method === 'DELETE') {
          store.deletePreset(name)
          return json({ deleted: name })
        }
        return json({ error: 'method not allowed' }, 405)
      }

      return notFound()
    } catch (error) {
      /* The browser adapter turns this into a StoreError, so a disk problem
         reaches the UI as a storage failure rather than as a parse error. */
      return json({ error: error instanceof Error ? error.message : 'storage failed' }, 500)
    }
  }
}
