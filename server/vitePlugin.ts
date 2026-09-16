import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import type { Plugin } from 'vite'
import { createApi } from './api.ts'
import { layoutFor } from './store.ts'
import { seedPresets } from './seed.ts'

/* Serves the same API the standalone server does, from inside `bun run dev`, so
   there is no second process to start while working and no chance of dev and
   production answering differently. */

export interface PatchApiOptions {
  /* Where the app's files live. */
  readonly root: string
  /* The bank shipped in the repo, copied into root/presets the first time. */
  readonly seed: string
}

/* Vite's dev server speaks Node's request and response objects; the handler
   speaks Fetch.

   The body is handed over as a stream rather than buffered, so it is only read
   if the handler actually reads it. That matters now that every request is
   offered to the handler: one it declines has to fall through to Vite with its
   body still unread, and a buffered body would have consumed the stream on the
   way past.

   Exported for its own test: everything the handler decides about a request —
   which origin it came from, whether it is secure, what cookies it carries —
   it decides from what this function builds. */
export function toRequest(req: IncomingMessage): Request {
  /* The real host, not a placeholder: an absolute URL built against a constant
     would tell the handler it is always on localhost, and code that reads the
     origin to decide anything — a cookie's Secure flag, a redirect back to
     where the request came from — would be reasoning about a fiction. */
  const scheme = 'encrypted' in req.socket && req.socket.encrypted ? 'https' : 'http'
  const host = req.headers.host ?? 'localhost'
  const url = new URL(req.url ?? '/', `${scheme}://${host}`)

  const method = (req.method ?? 'GET').toUpperCase()
  const canHaveBody = method !== 'GET' && method !== 'HEAD'

  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    /* Appended rather than set, and arrays kept: Node hands back an array for
       a header sent more than once, and dropping those silently loses whatever
       was repeated. */
    if (typeof value === 'string') headers.append(key, value)
    else if (Array.isArray(value)) for (const one of value) headers.append(key, one)
  }

  /* `duplex` is required for a streamed body and is missing from the runtime's
     RequestInit typing rather than from the runtime. */
  const init: RequestInit = { method, headers }
  if (canHaveBody) {
    Object.assign(init, { body: Readable.toWeb(req), duplex: 'half' })
  }

  return new Request(url.toString(), init)
}

export async function send(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status

  /* Set-Cookie is the one header that legitimately appears more than once, and
     `Headers.forEach` yields it as a single comma-joined string — which is not
     a valid Set-Cookie and drops every cookie but the first in practice. One
     sign-in sets two, so this would fail in dev and nowhere else. */
  for (const [key, value] of response.headers) {
    if (key.toLowerCase() !== 'set-cookie') res.setHeader(key, value)
  }
  const cookies = response.headers.getSetCookie()
  if (cookies.length > 0) res.setHeader('set-cookie', cookies)

  res.end(Buffer.from(await response.arrayBuffer()))
}

export function patchApi(options: PatchApiOptions): Plugin {
  return {
    name: 'moog-patch-api',
    async configureServer(server) {
      const seeded = await seedPresets(options.seed, layoutFor(options.root).presets)
      if (seeded.seeded.length > 0) {
        server.config.logger.info(
          `  ➜  Seeded ${seeded.seeded.length} new presets into ${options.root}/presets`,
        )
      }

      const handle = createApi({ root: options.root })
      /* Every request, not just /api/, because the handler already decides what
         is its own and returns null for the rest — which is exactly what the
         standalone server relies on. Filtering here instead would mean a route
         outside /api/ worked in production and fell through to the app in dev,
         and that difference is the thing sharing one handler exists to prevent. */
      server.middlewares.use((req, res, next) => {
        void (async () => {
          try {
            const response = await handle(toRequest(req))
            if (!response) return next()
            await send(res, response)
          } catch (error) {
            res.statusCode = 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: String(error) }))
          }
        })()
      })
    },
  }
}
