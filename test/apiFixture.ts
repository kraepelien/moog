import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Database } from 'bun:sqlite'
import { createApi } from '@server/api.ts'
import { authConfigFromEnv } from '@server/identity.ts'
import { limitsFromEnv } from '@server/limits.ts'
import { openDatabase } from '@server/db.ts'
import { syncInstruments } from '@server/factory.ts'
import { createHttpStore } from '@storage/httpStore.ts'
import type { PatchStore, TagStore } from '@storage/types.ts'

/* Drives the browser's own adapter against the server's own handler over a real
   temporary folder, with no socket in between. Every layer a save passes through
   is the shipped one — adapter, routing, path checks, file writing — so a test
   here fails for the same reasons the app would. */
export interface TestApi {
  readonly store: PatchStore & TagStore
  readonly root: string
  readonly db: Database
  cleanup(): void
}

export function testApi(): TestApi {
  const root = mkdtempSync(join(tmpdir(), 'moog-test-'))
  const db = openDatabase(join(root, 'moog.db'))
  syncInstruments(db)
  /* Config and limits from an empty environment, never from process.env: Bun
     loads .env before the suite runs, so a developer with real OAuth credentials
     on the machine would otherwise run every test signed out. */
  const handle = createApi({ db, config: authConfigFromEnv({}), limits: limitsFromEnv({}) })

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
