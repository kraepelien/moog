import { migrateToCurrent } from '../patch/migrate.ts'
import type { Patch } from '../patch/schema.ts'
import { StoreError, type PatchStore, type PatchSummary, type PresetStore } from './types.ts'

/* Talks to the folder on disk through the server that owns it. The same
   interface the localStorage adapter implemented, so nothing that uses a store
   had to change — which was the point of making it async from the first commit
   even while it was backed by something synchronous. */

const BASE = '/api'

/* fetch is a parameter so a test can drive this adapter against the real request
   handler without a socket, exercising the path the browser actually takes
   rather than a stand-in for it. */
export type Fetch = (path: string, init?: RequestInit) => Promise<Response>

async function requestWith(doFetch: Fetch, path: string, init?: RequestInit): Promise<unknown> {
  let response: Response
  try {
    response = await doFetch(BASE + path, {
      ...init,
      headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    })
  } catch (cause) {
    /* The server owning the files is not answering. Distinct from a rejected
       request, and the only failure a user can actually act on. */
    throw new StoreError('unavailable', 'Cannot reach the patch server.', { cause })
  }

  if (response.status === 404) return null
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new StoreError('io', `Storage request failed (${response.status}). ${detail}`.trim())
  }
  return response.json()
}

/* A file somebody edited by hand may not parse, and one written by a newer build
   may be a version this one cannot read. Both are skipped rather than thrown, so
   a single bad file cannot empty the list. */
function toPatch(raw: unknown): Patch | null {
  const migrated = migrateToCurrent(raw)
  return migrated.ok ? migrated.value : null
}

export function createHttpStore(
  doFetch: Fetch = (path, init) => fetch(path, init),
): PatchStore & PresetStore {
  const request = (path: string, init?: RequestInit) => requestWith(doFetch, path, init)

  return {
    async list(): Promise<readonly PatchSummary[]> {
      const raw = (await request('/patches')) as unknown[]
      return raw
        .map(toPatch)
        .filter((patch): patch is Patch => patch !== null)
        .map(({ id, name, createdAt, updatedAt }) => ({ id, name, createdAt, updatedAt }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    },

    async get(id: string): Promise<Patch | null> {
      const raw = await request(`/patches/${encodeURIComponent(id)}`)
      return raw === null ? null : toPatch(raw)
    },

    async save(patch: Patch): Promise<Patch> {
      await request(`/patches/${encodeURIComponent(patch.id)}`, {
        method: 'PUT',
        body: JSON.stringify(patch),
      })
      return patch
    },

    async delete(id: string): Promise<void> {
      await request(`/patches/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },

    async listPresets(): Promise<readonly Patch[]> {
      const raw = (await request('/presets')) as unknown[]
      return raw.map(toPatch).filter((patch): patch is Patch => patch !== null)
    },

    async savePreset(preset: Patch): Promise<void> {
      await request(`/presets/${encodeURIComponent(preset.id)}`, {
        method: 'PUT',
        body: JSON.stringify(preset),
      })
    },

    async deletePreset(slug: string): Promise<void> {
      await request(`/presets/${encodeURIComponent(slug)}`, { method: 'DELETE' })
    },
  }
}
