import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/* Patches and presets as files in a folder. One record per file, named by its id
   or slug, so the folder is readable, hand-editable and diffable in git — which
   is a better undo history than anything the app could keep. */

/* An id becomes a filename, so it is checked before it ever reaches the
   filesystem. Without this, an id of "../../etc/passwd" would escape the folder:
   the pattern, not the path join, is what prevents that. */
const SAFE_NAME = /^[A-Za-z0-9_-]+$/

export function isSafeName(name: string): boolean {
  return SAFE_NAME.test(name) && name.length <= 128
}

export interface FileStoreLayout {
  readonly patches: string
  readonly presets: string
  readonly draft: string
}

export function layoutFor(root: string): FileStoreLayout {
  return {
    patches: join(root, 'patches'),
    presets: join(root, 'presets'),
    draft: join(root, 'draft.json'),
  }
}

async function readJson(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    /* Missing or unreadable are the same to a caller: there is nothing here. A
       corrupt file is skipped rather than failing the whole listing, so one bad
       record cannot hide every other patch. */
    return null
  }
}

/* Written to a neighbouring temp file and renamed into place. writeFile truncates
   before it writes, so a crash or a full disk partway through would leave a
   half-written preset that parses as nothing; rename on the same filesystem is
   atomic, so a reader sees either the old file or the new one and never a
   fragment. The temp name carries a random suffix so two writes to the same
   record cannot collide on it. */
async function writeJson(path: string, value: unknown): Promise<void> {
  const dir = join(path, '..')
  await mkdir(dir, { recursive: true })
  const temp = `${path}.${Math.random().toString(36).slice(2)}.tmp`
  try {
    await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    await rename(temp, path)
  } catch (error) {
    await rm(temp, { force: true })
    throw error
  }
}

async function listJson(dir: string): Promise<{ name: string; value: unknown }[]> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return []
  }
  const out: { name: string; value: unknown }[] = []
  for (const file of names.sort()) {
    /* Dotfiles are bookkeeping, not records: .seeded.json ends in .json and
       would otherwise be listed as a preset. */
    if (file.startsWith('.') || !file.endsWith('.json')) continue
    const value = await readJson(join(dir, file))
    if (value !== null) out.push({ name: file.slice(0, -'.json'.length), value })
  }
  return out
}

export function createFileStore(root: string) {
  const at = layoutFor(root)

  return {
    layout: at,

    async listPatches(): Promise<unknown[]> {
      return (await listJson(at.patches)).map((entry) => entry.value)
    },

    async getPatch(id: string): Promise<unknown | null> {
      if (!isSafeName(id)) return null
      return readJson(join(at.patches, `${id}.json`))
    },

    async putPatch(id: string, patch: unknown): Promise<void> {
      if (!isSafeName(id)) throw new Error(`Unsafe patch id: ${id}`)
      await writeJson(join(at.patches, `${id}.json`), patch)
    },

    async deletePatch(id: string): Promise<void> {
      if (!isSafeName(id)) throw new Error(`Unsafe patch id: ${id}`)
      await rm(join(at.patches, `${id}.json`), { force: true })
    },

    async listPresets(): Promise<unknown[]> {
      return (await listJson(at.presets)).map((entry) => entry.value)
    },

    async putPreset(slug: string, preset: unknown): Promise<void> {
      if (!isSafeName(slug)) throw new Error(`Unsafe preset slug: ${slug}`)
      await writeJson(join(at.presets, `${slug}.json`), preset)
    },

    async deletePreset(slug: string): Promise<void> {
      if (!isSafeName(slug)) throw new Error(`Unsafe preset slug: ${slug}`)
      await rm(join(at.presets, `${slug}.json`), { force: true })
    },

    async readDraft(): Promise<unknown | null> {
      return readJson(at.draft)
    },

    async writeDraft(patch: unknown): Promise<void> {
      await writeJson(at.draft, patch)
    },

    async clearDraft(): Promise<void> {
      await rm(at.draft, { force: true })
    },
  }
}

export type FileStore = ReturnType<typeof createFileStore>
