import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApi } from '../server/api.ts'
import { createHttpStore } from '../src/storage/httpStore.ts'
import type { PatchStore, PresetStore } from '../src/storage/types.ts'

/* Drives the browser's own adapter against the server's own handler over a real
   temporary folder, with no socket in between. Every layer a save passes through
   is the shipped one — adapter, routing, path checks, file writing — so a test
   here fails for the same reasons the app would. */
export interface TestApi {
  readonly store: PatchStore & PresetStore
  readonly root: string
  cleanup(): void
}

export function testApi(): TestApi {
  const root = mkdtempSync(join(tmpdir(), 'moog-test-'))
  const handle = createApi({ root })

  const store = createHttpStore(async (path, init) => {
    const response = await handle(new Request(`http://test${path}`, init))
    return response ?? new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
  })

  return { store, root, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}
