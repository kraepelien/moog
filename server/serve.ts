import { join } from 'node:path'
import { createApi } from './api.ts'
import { backupTo, openDatabase } from './db.ts'
import { loadFactory } from './factory.ts'
import { seedTags } from './tags.ts'

/* Serves the built app plus the same API the dev plugin serves, for running the
   editor without a toolchain. `bun run serve` after `bun run build`. */

/* New files are written group-writable rather than the default 644. The data
   folder belongs to a group holding both this process and the person who logs
   in, and the point of keeping patches as files is that they can be edited by
   hand — which a group-readable-only file does not allow. */
process.umask(0o002)

const root = process.env.MOOG_DATA ?? 'data'
const seed = process.env.MOOG_PRESETS ?? 'presets'
const dist = process.env.MOOG_DIST ?? 'dist'
const port = Number(process.env.PORT ?? 5174)

const db = openDatabase(join(root, 'moog.db'))
const factory = loadFactory(db, seed)
seedTags(db)
console.log(`Factory bank: ${factory.loaded} presets, ${factory.retired} retired`)

/* A dated copy every day, because a plain file copy of a database in WAL mode
   can catch it mid-write and the backup on the NAS is a file copy. */
const backup = () => backupTo(db, join(root, 'backups', `moog-${new Date().toISOString().slice(0, 10)}.db`))
backup()
setInterval(backup, 24 * 60 * 60 * 1000)

const handle = createApi({ db })

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
