import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/* The client secret is read in server/ and nowhere else. This is the check that
   a later refactor reaching for it from src/ fails here rather than shipping:
   Vite inlines anything a bundled module reads, and only a build would show
   it. */

const SECRET_NAMES = ['MOOG_OAUTH_CLIENT_SECRET', 'MOOG_SESSION_SECRET']

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

describe('the client secret', () => {
  test('is never read by anything that gets bundled', () => {
    const offenders = filesUnder('src')
      .filter((path) => /\.tsx?$/.test(path))
      .filter((path) => SECRET_NAMES.some((name) => readFileSync(path, 'utf8').includes(name)))

    expect({
      offenders,
      why: 'Something under src/ names a server secret. Vite inlines what a bundled module reads, so it would ship to the browser.',
    }).toEqual({ offenders: [], why: expect.any(String) })
  })

  test('is not in a build, when there is one to look at', () => {
    /* Skipped rather than failed without a build: `bun test` runs without one,
       and the check is worth having in CI where there is. */
    if (!existsSync('dist')) return

    const bundled = filesUnder('dist')
      .filter((path) => /\.(js|css|html|map)$/.test(path))
      .filter((path) => SECRET_NAMES.some((name) => readFileSync(path, 'utf8').includes(name)))

    expect(bundled).toEqual([])
  })

  test('has an env file that is ignored by git', () => {
    const ignored = readFileSync('.gitignore', 'utf8')
    expect(ignored).toContain('\n.env\n')
    expect(ignored).toContain('.env.*')
  })
})
