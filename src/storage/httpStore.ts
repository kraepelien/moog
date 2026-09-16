import { migrateToCurrent } from '../patch/migrate.ts'
import type { Patch } from '../patch/schema.ts'
import type { LibraryEntry } from '../components/library/entry.ts'
import {
  StoreError,
  type LibraryStore,
  type PatchStore,
  type PatchSummary,
  type PresetStore,
} from './types.ts'

/* The same interface the localStorage adapter implemented, which is why it was
   async from the first commit while still backed by something synchronous. */

const BASE = '/api'

/* A parameter so a test can drive this against the real handler with no
   socket, exercising the path the browser takes rather than a stand-in. */
export type Fetch = (path: string, init?: RequestInit) => Promise<Response>

/* Exported for its own test: no store method passes a header yet, so the merge
   below would otherwise be checked by nothing. */
export async function requestWith(
  doFetch: Fetch,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  let response: Response
  try {
    response = await doFetch(BASE + path, {
      ...init,
      /* After the default, not before: the other way round dropped a caller's
         header without saying so. */
      headers: {
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...init?.headers,
      },
      /* Already the default here, but the session depends on it. */
      credentials: 'same-origin',
    })
  } catch (cause) {
    /* The server owning the files is not answering. Distinct from a rejected
       request, and the only failure a user can actually act on. */
    throw new StoreError('unavailable', 'Cannot reach the patch server.', { cause })
  }

  if (response.status === 404) return null
  if (response.status === 401) {
    throw new StoreError('unauthenticated', 'Sign in to do that.')
  }
  if (response.status === 403) {
    throw new StoreError('forbidden', 'That belongs to somebody else.')
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new StoreError('io', `Storage request failed (${response.status}). ${detail}`.trim())
  }

  /* A page fallback or a proxy's error page answering instead of the API;
     letting JSON.parse throw would surface it as an unrelated SyntaxError. */
  try {
    return await response.json()
  } catch (cause) {
    throw new StoreError('io', 'The patch server answered with something that is not JSON.', {
      cause,
    })
  }
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
): PatchStore & PresetStore & LibraryStore {
  const request = (path: string, init?: RequestInit) => requestWith(doFetch, path, init)

  return {
    async list(): Promise<readonly PatchSummary[]> {
      const raw = (await request('/patches')) as unknown[]
      return raw
        .map(toPatch)
        .filter((patch): patch is Patch => patch !== null)
        .map(({ id, name, tags, instrument, visibility, createdAt, updatedAt }) => ({
          id,
          name,
          tags,
          instrument,
          visibility,
          createdAt,
          updatedAt,
        }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    },

    async get(id: string): Promise<Patch | null> {
      const raw = await request(`/patches/${encodeURIComponent(id)}`)
      return raw === null ? null : toPatch(raw)
    },

    async create(patch: Patch, from?: string): Promise<Patch> {
      const raw = await request('/patches', {
        method: 'POST',
        body: JSON.stringify(from === undefined ? patch : { ...patch, from }),
      })
      const stored = toPatch(raw)
      if (!stored) throw new StoreError('io', 'The server stored something unreadable.')
      return stored
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

    async library(instrument?: string): Promise<readonly LibraryEntry[]> {
      const path = instrument === undefined ? '/library' : `/library?instrument=${encodeURIComponent(instrument)}`
      return ((await request(path)) ?? []) as LibraryEntry[]
    },

    async rate(id: string, stars: number): Promise<void> {
      await request(`/patches/${encodeURIComponent(id)}/rating`, {
        method: 'PUT',
        body: JSON.stringify({ stars }),
      })
    },

    async listPresets(): Promise<readonly Patch[]> {
      const raw = (await request('/presets')) as unknown[]
      return raw.map(toPatch).filter((patch): patch is Patch => patch !== null)
    },

  }
}
