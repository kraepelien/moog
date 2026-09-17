import { describe, expect, test } from 'bun:test'
import { PATCH_SCHEMA_VERSION, createPatch } from '../src/patch/schema.ts'
import {
  BUNDLE_FORMAT,
  BUNDLE_FORMAT_VERSION,
  createBundle,
  parseBundle,
  serializeBundle,
} from '../src/transfer/bundle.ts'
import { fixedIdentity } from './fixtures.ts'

function roundTrip(text: string) {
  return parseBundle(text, fixedIdentity('imported'))
}

describe('export', () => {
  test('a single patch still exports as an array', () => {
    const bundle = createBundle([createPatch({ name: 'One' }, fixedIdentity())], fixedIdentity())
    expect(bundle.format).toBe(BUNDLE_FORMAT)
    expect(bundle.formatVersion).toBe(BUNDLE_FORMAT_VERSION)
    expect(bundle.patches).toHaveLength(1)
  })

  test('serializes to newline-terminated JSON', () => {
    const text = serializeBundle(createBundle([], fixedIdentity()))
    expect(text.endsWith('\n')).toBe(true)
    expect(JSON.parse(text).patches).toEqual([])
  })
})

describe('import', () => {
  test('round-trips patches, giving them fresh ids so an export cannot clobber its source', () => {
    const original = createPatch({ name: 'Bass', values: { testVolume: 3 } }, fixedIdentity())
    const result = roundTrip(serializeBundle(createBundle([original], fixedIdentity())))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const [imported] = result.value.patches
    expect(imported?.name).toBe('BASS')
    expect(imported?.values).toEqual({ testVolume: 3 })
    expect(imported?.id).not.toBe(original.id)
    expect(result.value.rejected).toEqual([])
  })

  test('rejects a file that is not JSON', () => {
    const result = roundTrip('{ not json')
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toMatch(/not valid JSON/)
  })

  test('rejects a JSON file that is not a patch bundle', () => {
    const result = roundTrip(JSON.stringify({ hello: 'world' }))
    expect(!result.ok && result.error).toMatch(/is not a Minimoog patch bundle/)
  })

  test('rejects a bundle format version from the future rather than guessing', () => {
    const result = roundTrip(
      JSON.stringify({
        format: BUNDLE_FORMAT,
        formatVersion: BUNDLE_FORMAT_VERSION + 1,
        exportedAt: '',
        patches: [],
      }),
    )
    expect(!result.ok && result.error).toMatch(/Update the app/)
  })

  test('skips a bad patch and reports it, keeping the good ones', () => {
    const good = createPatch({ name: 'Good' }, fixedIdentity())
    const result = roundTrip(
      JSON.stringify({
        format: BUNDLE_FORMAT,
        formatVersion: BUNDLE_FORMAT_VERSION,
        exportedAt: '',
        patches: [good, { name: 'Broken' }, { ...good, schemaVersion: PATCH_SCHEMA_VERSION + 9 }],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.patches.map((p) => p.name)).toEqual(['GOOD'])
    expect(result.value.rejected).toHaveLength(2)
    expect(result.value.rejected[0]).toMatchObject({ index: 1, name: 'Broken' })
    expect(result.value.rejected[1]?.reason).toMatch(/Update the app/)
  })

  test('a patch carrying an unrecognised control id imports with it intact', () => {
    const source = createPatch({ name: 'Future', values: { notYetDefined: 7 } }, fixedIdentity())
    const result = roundTrip(serializeBundle(createBundle([source], fixedIdentity())))
    expect(result.ok && result.value.patches[0]?.values).toEqual({ notYetDefined: 7 })
  })
})
