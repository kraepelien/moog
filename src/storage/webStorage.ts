import { migrateToCurrent } from '../patch/migrate.ts'
import type { Patch } from '../patch/schema.ts'
import { presetOverrideSchema, type PresetOverride } from '../presets/overrides.ts'
import {
  type DraftStore,
  type PatchStore,
  type PatchSummary,
  type PresetOverrideStore,
  StoreError,
} from './types.ts'

/* The slice of the Storage interface this adapter uses. Taken as a parameter
   rather than reaching for window.localStorage so the store is testable off a
   browser and so the in-memory fallback is the same code path. */
export interface StorageLike {
  readonly length: number
  key(index: number): string | null
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const PATCH_PREFIX = 'moog:patch:'
const OVERRIDE_PREFIX = 'moog:preset:'
const DRAFT_KEY = 'moog:draft'

export function createMemoryStorage(): StorageLike {
  const entries = new Map<string, string>()
  return {
    get length() {
      return entries.size
    },
    key: (index) => [...entries.keys()][index] ?? null,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => void entries.set(key, value),
    removeItem: (key) => void entries.delete(key),
  }
}

/* Safari refuses localStorage entirely for pages opened from file://, and private
   windows can throw on write rather than on read, so the probe writes. */
export function resolveBrowserStorage(): { storage: StorageLike; persistent: boolean } {
  try {
    const probe = 'moog:probe'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return { storage: window.localStorage, persistent: true }
  } catch {
    return { storage: createMemoryStorage(), persistent: false }
  }
}

function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  )
}

function write(storage: StorageLike, key: string, value: string): void {
  try {
    storage.setItem(key, value)
  } catch (error) {
    if (isQuotaError(error)) {
      throw new StoreError('quota', 'Out of storage space for patches.', { cause: error })
    }
    throw new StoreError('io', 'Could not write to storage.', { cause: error })
  }
}

function readPatch(storage: StorageLike, key: string): Patch | null {
  const raw = storage.getItem(key)
  if (raw === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  const migrated = migrateToCurrent(parsed)
  return migrated.ok ? migrated.value : null
}

/* No key index. Scanning on list() costs nothing at this size and cannot drift
   out of sync with the records the way a maintained index can. */
export function createWebStorageStore(
  storage: StorageLike,
): PatchStore & DraftStore & PresetOverrideStore {
  return {
    async list(): Promise<readonly PatchSummary[]> {
      const summaries: PatchSummary[] = []
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i)
        if (key === null || !key.startsWith(PATCH_PREFIX)) continue
        /* A record that will not parse is skipped rather than failing the whole
           list, so one bad entry cannot lock a user out of every other patch. */
        const patch = readPatch(storage, key)
        if (!patch) continue
        summaries.push({
          id: patch.id,
          name: patch.name,
          createdAt: patch.createdAt,
          updatedAt: patch.updatedAt,
        })
      }
      summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      return summaries
    },

    async get(id: string): Promise<Patch | null> {
      return readPatch(storage, PATCH_PREFIX + id)
    },

    async save(patch: Patch): Promise<Patch> {
      write(storage, PATCH_PREFIX + patch.id, JSON.stringify(patch))
      return patch
    },

    async delete(id: string): Promise<void> {
      storage.removeItem(PATCH_PREFIX + id)
    },

    async listOverrides(): Promise<readonly PresetOverride[]> {
      const overrides: PresetOverride[] = []
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i)
        if (key === null || !key.startsWith(OVERRIDE_PREFIX)) continue
        const raw = storage.getItem(key)
        if (raw === null) continue
        try {
          const parsed = presetOverrideSchema.safeParse(JSON.parse(raw))
          /* One unreadable override is skipped rather than failing the whole
             bank, so a bad record cannot hide every preset. */
          if (parsed.success) overrides.push(parsed.data)
        } catch {
          /* Skipped. */
        }
      }
      return overrides
    },

    async saveOverride(override: PresetOverride): Promise<void> {
      write(storage, OVERRIDE_PREFIX + override.slug, JSON.stringify(override))
    },

    async clearOverride(slug: string): Promise<void> {
      storage.removeItem(OVERRIDE_PREFIX + slug)
    },

    async readDraft(): Promise<Patch | null> {
      return readPatch(storage, DRAFT_KEY)
    },

    async writeDraft(patch: Patch): Promise<void> {
      write(storage, DRAFT_KEY, JSON.stringify(patch))
    },

    async clearDraft(): Promise<void> {
      storage.removeItem(DRAFT_KEY)
    },
  }
}
