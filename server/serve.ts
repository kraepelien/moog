import { join } from 'node:path'
import { createApi } from './api.ts'
import { seedPresets } from './seed.ts'
import { layoutFor } from './store.ts'

/* Serves the built app plus the same API the dev plugin serves, for running the
   editor without a toolchain. `bun run serve` after `bun run build`. */

const root = process.env.MOOG_DATA ?? 'data'
const seed = process.env.MOOG_PRESETS ?? 'presets'
const dist = process.env.MOOG_DIST ?? 'dist'
const port = Number(process.env.PORT ?? 5174)

const seeded = await seedPresets(seed, layoutFor(root).presets)
if (seeded.reason === 'seeded') console.log(`Seeded ${seeded.seeded} presets into ${root}/presets`)

const handle = createApi({ root })

Bun.serve({
  port,
  /* Bound to every interface so the editor is reachable from a phone on the same
     network, which is how the panel gets tested on a touch screen. */
  hostname: '0.0.0.0',
  async fetch(request) {
    const api = await handle(request)
    if (api) return api

    const url = new URL(request.url)
    const file = Bun.file(join(dist, url.pathname === '/' ? 'index.html' : url.pathname))
    if (await file.exists()) return new Response(file)

    /* Anything else is a client route: hand back the app and let it decide. */
    return new Response(Bun.file(join(dist, 'index.html')), {
      headers: { 'content-type': 'text/html' },
    })
  },
})

console.log(`Minimoog patch editor on http://localhost:${port}  (data in ./${root})`)
