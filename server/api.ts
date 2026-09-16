import { createFileStore, isSafeName, type FileStore } from './store.ts'

/* One request handler, shared by the Vite dev plugin and the standalone server,
   so development and production cannot drift into answering differently. */

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
  /* Everything the app writes lives under here. */
  readonly root: string
}

export function createApi({ root }: ApiOptions): (request: Request) => Promise<Response | null> {
  const store: FileStore = createFileStore(root)

  /* Returns null for anything that is not ours, so the caller can fall through
     to serving the app rather than 404ing every page load. */
  return async function handle(request: Request): Promise<Response | null> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return null

    const parts = url.pathname.slice('/api/'.length).split('/').filter(Boolean)
    const [resource, name] = parts
    const method = request.method.toUpperCase()

    try {
      if (resource === 'patches') {
        if (!name) {
          if (method === 'GET') return json(await store.listPatches())
          return json({ error: 'method not allowed' }, 405)
        }
        if (!isSafeName(name)) return json({ error: 'invalid id' }, 400)
        if (method === 'GET') {
          const patch = await store.getPatch(name)
          return patch === null ? notFound() : json(patch)
        }
        if (method === 'PUT') {
          const payload = await body(request)
          if (payload === null) return json({ error: 'invalid body' }, 400)
          await store.putPatch(name, payload)
          return json(payload)
        }
        if (method === 'DELETE') {
          await store.deletePatch(name)
          return json({ deleted: name })
        }
        return json({ error: 'method not allowed' }, 405)
      }

      if (resource === 'presets') {
        if (!name) {
          if (method === 'GET') return json(await store.listPresets())
          return json({ error: 'method not allowed' }, 405)
        }
        if (!isSafeName(name)) return json({ error: 'invalid slug' }, 400)
        if (method === 'PUT') {
          const payload = await body(request)
          if (payload === null) return json({ error: 'invalid body' }, 400)
          await store.putPreset(name, payload)
          return json(payload)
        }
        if (method === 'DELETE') {
          await store.deletePreset(name)
          return json({ deleted: name })
        }
        return json({ error: 'method not allowed' }, 405)
      }

      if (resource === 'draft' && !name) {
        if (method === 'GET') return json(await store.readDraft())
        if (method === 'PUT') {
          const payload = await body(request)
          if (payload === null) return json({ error: 'invalid body' }, 400)
          await store.writeDraft(payload)
          return json(payload)
        }
        if (method === 'DELETE') {
          await store.clearDraft()
          return json({ deleted: 'draft' })
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
