import { describe, expect, test } from 'bun:test'
import lock from './patch-format.lock.json'
import { panelRegistry } from '@controls/panel.ts'
import { PATCH_SCHEMA_VERSION, patchSchema } from '@patch/schema.ts'
import { BUNDLE_FORMAT, BUNDLE_FORMAT_VERSION } from '@transfer/bundle.ts'

/* The names in a saved patch are a published interface. A control id or a
   position id that changes does not fail anywhere: the old id becomes unknown
   and is quietly preserved, the new one takes its default, and the patch looks
   like it loaded while the setting is gone. Somebody's sound is wrong and
   nothing said so.

   patch-format.lock.json records every name the format has ever used. It is
   written by hand and only ever ADDED to. If one of these tests fails, the fix
   is almost never to edit the lock: it is to put the old name back. */

interface LockedControl {
  readonly type: string
  readonly positions?: readonly string[]
}

const locked = lock.controls as Record<string, LockedControl>

function live() {
  const out: Record<string, LockedControl> = {}
  for (const def of panelRegistry.controls) {
    const positions = 'positions' in def ? (def.positions as { id: string }[]) : undefined
    out[def.id] = positions
      ? { type: def.type, positions: positions.map((p) => p.id) }
      : { type: def.type }
  }
  return out
}

describe('control ids are a published interface', () => {
  test('every locked control id still exists', () => {
    const missing = Object.keys(locked).filter((id) => !(id in live()))
    expect({
      missing,
      why: 'A locked control id is gone. Renaming one silently drops that setting from every saved patch. Restore the id rather than editing the lock.',
    }).toEqual({ missing: [], why: expect.any(String) })
  })

  test('every live control id is recorded in the lock', () => {
    /* Not a break, but a new control is unprotected until it is written down —
       so the lock is required to stay complete rather than drifting behind. */
    const unrecorded = Object.keys(live()).filter((id) => !(id in locked))
    expect({
      unrecorded,
      why: 'New control ids must be added to test/patch-format.lock.json so they are protected from later renaming.',
    }).toEqual({ unrecorded: [], why: expect.any(String) })
  })

  test('no control has changed the type of value it stores', () => {
    const changed = Object.entries(locked)
      .filter(([id, was]) => live()[id] && live()[id]!.type !== was.type)
      .map(([id, was]) => `${id}: was ${was.type}, now ${live()[id]!.type}`)
    expect(changed).toEqual([])
  })
})

describe('position ids are a published interface too', () => {
  test('every locked position still exists on its control', () => {
    const now = live()
    const lost: string[] = []
    for (const [id, was] of Object.entries(locked)) {
      if (!was.positions) continue
      const current = now[id]?.positions ?? []
      for (const position of was.positions) {
        if (!current.includes(position)) lost.push(`${id}.${position}`)
      }
    }
    expect({
      lost,
      why: 'A locked position id is gone. Every patch that stored it would fall back to the default. Restore the id rather than editing the lock.',
    }).toEqual({ lost: [], why: expect.any(String) })
  })

  test('positions keep their order, since order is what the dial draws', () => {
    const now = live()
    for (const [id, was] of Object.entries(locked)) {
      if (!was.positions) continue
      const current = now[id]?.positions ?? []
      /* Added positions may only appear after the locked ones; inserting one in
         the middle moves every detent after it. */
      expect([id, current.slice(0, was.positions.length)]).toEqual([id, [...was.positions]])
    }
  })

  test('every live position is recorded', () => {
    const now = live()
    const unrecorded: string[] = []
    for (const [id, current] of Object.entries(now)) {
      if (!current.positions) continue
      const was = locked[id]?.positions ?? []
      for (const position of current.positions) {
        if (!was.includes(position)) unrecorded.push(`${id}.${position}`)
      }
    }
    expect({
      unrecorded,
      why: 'New position ids must be added to test/patch-format.lock.json.',
    }).toEqual({ unrecorded: [], why: expect.any(String) })
  })
})

describe('the fields of a patch are a published interface', () => {
  test('every locked field is still in the schema', () => {
    /* Renaming `notes` drops it from every saved patch exactly the way renaming
       a control id would, and just as quietly: the old key becomes unknown and
       the new one is empty. */
    const live = Object.keys(patchSchema.shape)
    const missing = (lock.patchFields as string[]).filter((field) => !live.includes(field))
    expect({
      missing,
      why: 'A locked patch field is gone. Restore the name rather than editing the lock; if the field really must change, it needs a migration and a new schema version.',
    }).toEqual({ missing: [], why: expect.any(String) })
  })

  test('every field in the schema is recorded', () => {
    const unrecorded = Object.keys(patchSchema.shape).filter(
      (field) => !(lock.patchFields as string[]).includes(field),
    )
    expect({
      unrecorded,
      why: 'New patch fields must be added to test/patch-format.lock.json.',
    }).toEqual({ unrecorded: [], why: expect.any(String) })
  })
})

describe('the envelope around a patch', () => {
  test('the bundle format string has not changed', () => {
    /* Import matches on this exactly; changing it makes every exported file
       unreadable. */
    expect(BUNDLE_FORMAT).toBe(lock.bundleFormat)
  })

  test('versions only ever go up', () => {
    expect(PATCH_SCHEMA_VERSION).toBeGreaterThanOrEqual(lock.patchSchemaVersion)
    expect(BUNDLE_FORMAT_VERSION).toBeGreaterThanOrEqual(lock.bundleFormatVersion)
  })

  test('a raised patch schema version comes with a migration from the old one', () => {
    /* Raising the version without one makes every existing patch unreadable,
       since a version with no route forward is refused rather than guessed. */
    if (PATCH_SCHEMA_VERSION > lock.patchSchemaVersion) {
      const { migrations } = require('@patch/migrate.ts')
      for (let from = lock.patchSchemaVersion; from < PATCH_SCHEMA_VERSION; from++) {
        expect([from, typeof migrations[from]]).toEqual([from, 'function'])
      }
    }
  })
})
