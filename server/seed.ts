import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/* The repo carries a seed bank of presets. The first time the app runs against a
   folder, that bank is copied into it; from then on the active folder is the
   only thing read, and its files are yours to edit or delete.

   Seeding once, rather than merging on every start, is what makes deletion
   stick: a preset you removed must not come back the next time the server
   starts. The seed stays in the repo, so restoring one is a file copy — or a
   `git checkout` of the active folder, if that is version-controlled too. */

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export interface SeedResult {
  readonly seeded: number
  readonly reason: 'already-present' | 'seeded' | 'no-seed-bank'
}

export async function seedPresets(seedDir: string, activeDir: string): Promise<SeedResult> {
  /* A marker rather than "is the folder empty": an empty folder is a legitimate
     state — every preset deleted — and re-seeding it would resurrect them. */
  const marker = join(activeDir, '.seeded')
  if (await exists(marker)) return { seeded: 0, reason: 'already-present' }
  if (!(await exists(seedDir))) return { seeded: 0, reason: 'no-seed-bank' }

  await mkdir(activeDir, { recursive: true })

  let seeded = 0
  for (const file of (await readdir(seedDir)).sort()) {
    if (!file.endsWith('.json')) continue
    const target = join(activeDir, file)
    /* Never overwrite: if a file is already there, it is the user's. */
    if (await exists(target)) continue
    await writeFile(target, await readFile(join(seedDir, file), 'utf8'), 'utf8')
    seeded++
  }

  await writeFile(marker, `seeded ${new Date().toISOString()}\n`, 'utf8')
  return { seeded, reason: 'seeded' }
}
