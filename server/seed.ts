import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/* The repo carries a seed bank of presets. The first time the app runs against a
   folder, that bank is copied in; from then on the active folder is the only
   thing read, and its files are yours to edit or delete.

   What is recorded is the list of slugs ever seeded, not a bare "done" flag.
   That distinction is the whole design:

     - a preset you deleted has its slug in the list, so it stays deleted
     - a preset added in a later build is not in the list, so it arrives
     - a preset you edited is already a file, so it is left alone

   A bare flag would get the first right and the second wrong, which for anything
   deployed from an image means a new preset could never reach an existing
   install. */

const MANIFEST = '.seeded.json'

interface Manifest {
  readonly slugs: string[]
  readonly at: string
}

async function readManifest(dir: string): Promise<Manifest> {
  try {
    const parsed = JSON.parse(await readFile(join(dir, MANIFEST), 'utf8'))
    if (Array.isArray(parsed?.slugs)) {
      return { slugs: parsed.slugs.filter((s: unknown) => typeof s === 'string'), at: parsed.at }
    }
  } catch {
    /* Missing or unreadable: nothing has been seeded here yet. */
  }
  return { slugs: [], at: '' }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path)
    return true
  } catch {
    return false
  }
}

export interface SeedResult {
  readonly seeded: readonly string[]
  readonly skipped: number
}

export async function seedPresets(seedDir: string, activeDir: string): Promise<SeedResult> {
  let shipped: string[]
  try {
    shipped = (await readdir(seedDir)).filter((file) => file.endsWith('.json')).sort()
  } catch {
    return { seeded: [], skipped: 0 }
  }

  await mkdir(activeDir, { recursive: true })
  const manifest = await readManifest(activeDir)
  const known = new Set(manifest.slugs)

  const seeded: string[] = []
  let skipped = 0

  for (const file of shipped) {
    const slug = file.slice(0, -'.json'.length)
    /* Seen before — whether it is still there, edited, or deleted on purpose. */
    if (known.has(slug)) {
      skipped++
      continue
    }
    /* Not in the manifest but already a file: someone put it there. Do not
       overwrite it, but record it so it is never seeded over later. */
    if (!(await fileExists(join(activeDir, file)))) {
      await writeFile(join(activeDir, file), await readFile(join(seedDir, file), 'utf8'), 'utf8')
      seeded.push(slug)
    } else {
      skipped++
    }
    known.add(slug)
  }

  await writeFile(
    join(activeDir, MANIFEST),
    `${JSON.stringify({ slugs: [...known].sort(), at: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  )

  return { seeded, skipped }
}
