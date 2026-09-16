import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Database } from 'bun:sqlite'
import { createApi } from '../server/api.ts'
import { openDatabase } from '../server/db.ts'
import { syncInstruments } from '../server/factory.ts'
import { createHttpStore } from '../src/storage/httpStore.ts'
import type { PatchStore, PresetStore, TagStore } from '../src/storage/types.ts'

/* Drives the browser's own adapter against the server's own handler over a real
   temporary folder, with no socket in between. Every layer a save passes through
   is the shipped one — adapter, routing, path checks, file writing — so a test
   here fails for the same reasons the app would. */
export interface TestApi {
  readonly store: PatchStore & PresetStore & TagStore
  readonly root: string
  readonly db: Database
  cleanup(): void
}

export function testApi(): TestApi {
  const root = mkdtempSync(join(tmpdir(), 'moog-test-'))
  const db = openDatabase(join(root, 'moog.db'))
  syncInstruments(db)
  const handle = createApi({ db })

  const store = createHttpStore(async (path, init) => {
    const response = await handle(new Request(`http://test${path}`, init))
    return response ?? new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
  })

  return {
    store,
    root,
    db,
    cleanup: () => {
      db.close()
      rmSync(root, { recursive: true, force: true })
    },
  }
}
