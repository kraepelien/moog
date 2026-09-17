import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dir, '..')
const ENTRY = 'server/serve.ts'

/* Made by the build stage, so they are absent from a clean checkout and cannot
   be looked for on disk here. */
const BUILT = ['dist', 'node_modules']

const dockerfile = readFileSync(join(ROOT, 'Dockerfile'), 'utf8')

/* The last stage is the one that ships. The build stage holds the whole tree
   and would make every assertion here pass. */
const runtimeStage = dockerfile.split(/^FROM .*$/m).at(-1) ?? ''

const copied = [...runtimeStage.matchAll(/^COPY --from=\S+ \/app\/(\S+)/gm)].map((m) => m[1] ?? '')

/* The aliases the server imports through, read from the file the compilers and
   Vite read, so a new one cannot be added without this walk following it. */
const { compilerOptions } = JSON.parse(readFileSync(join(ROOT, 'tsconfig.paths.json'), 'utf8')) as {
  compilerOptions: { paths: Record<string, string[]> }
}

const aliases = Object.entries(compilerOptions.paths).map(([pattern, [target]]) => ({
  prefix: pattern.replace('/*', ''),
  directory: target.replace('./', '').replace('/*', ''),
}))

function importsIn(file: string): string[] {
  const source = readFileSync(join(ROOT, file), 'utf8')
  const found = [...source.matchAll(/\bfrom\s+'([^']+)'|\bimport\s+'([^']+)'/g)]
  return found.map((m) => m[1] ?? m[2] ?? '')
}

/* A file in this repo, or null for a package, which arrives with node_modules
   rather than as a path of ours. Aliased and relative specifiers alike carry
   their extension, so resolution is a join: Bun's extension search never runs,
   and neither does ours. */
function locate(file: string, specifier: string): string | null {
  if (specifier.startsWith('.')) return relative(ROOT, resolve(ROOT, dirname(file), specifier))
  const alias = aliases.find((a) => specifier.startsWith(`${a.prefix}/`))
  return alias ? `${alias.directory}${specifier.slice(alias.prefix.length)}` : null
}

function walk(entry: string) {
  const reached = new Set<string>()
  const unresolved: string[] = []
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.shift() as string
    if (reached.has(file)) continue
    reached.add(file)
    for (const specifier of importsIn(file)) {
      const target = locate(file, specifier)
      if (target === null) continue
      if (existsSync(join(ROOT, target))) queue.push(target)
      else unresolved.push(`${file} → ${specifier}`)
    }
  }
  return { reached: [...reached], unresolved }
}

const graph = walk(ENTRY)

function isCopied(file: string) {
  return copied.some((path) => file === path || file.startsWith(`${path}/`))
}

describe('the runtime image', () => {
  test('copies every file the server imports at startup', () => {
    /* The server is not bundled: CMD runs Bun against serve.ts and its imports
       resolve as the process boots, so a file left out of the image is a
       crashloop rather than a build error. This is how src/ went missing. */
    expect(graph.reached.filter((file) => !isCopied(file))).toEqual([])
  })

  test('is checked against an entrypoint that does reach outside server/', () => {
    expect(graph.reached.some((file) => !file.startsWith('server/'))).toBe(true)
  })

  test('is checked against a graph that resolved whole', () => {
    expect(graph.unresolved).toEqual([])
  })

  test('copies the alias map the server resolves those imports through', () => {
    /* Bun maps `@patch/schema.ts` by reading `paths` out of the tsconfig as it
       boots, so the map is a runtime dependency like any imported file — and an
       invisible one, since nothing imports it. Without it every crossing import
       is an unresolved bare specifier and the container crashloops. */
    const aliased = graph.reached.filter((file) =>
      importsIn(file).some((specifier) => aliases.some((a) => specifier.startsWith(`${a.prefix}/`))),
    )
    expect(aliased.length).toBeGreaterThan(0)
    expect(['tsconfig.json', 'tsconfig.paths.json'].filter((file) => !isCopied(file))).toEqual([])
  })

  test('copies only paths that exist, so a typo fails here rather than on the NAS', () => {
    const absent = copied.filter((path) => !BUILT.includes(path) && !existsSync(join(ROOT, path)))
    expect(absent).toEqual([])
  })

  test('starts the entrypoint this test walks', () => {
    expect(dockerfile).toMatch(new RegExp(`CMD .*${ENTRY}`))
  })
})
