import { describe, expect, test } from 'bun:test'
import { createDeviceRail } from '@storage/deviceRail.ts'
import type { StorageLike } from '@storage/deviceSkin.ts'

/* Whether the rail is folded. Driven through a fake rather than a real Storage:
   Bun's runtime has none, which is the reason the adapter takes one as a
   parameter. */

function fakeStorage() {
  const held = new Map<string, string>()
  return {
    held,
    storage: {
      getItem: (key: string) => held.get(key) ?? null,
      setItem: (key: string, value: string) => void held.set(key, value),
      removeItem: (key: string) => void held.delete(key),
    } satisfies StorageLike,
  }
}

const throwing: StorageLike = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
  removeItem: () => {
    throw new Error('blocked')
  },
}

describe('keeping the rail folded', () => {
  test('gives back what it was given', () => {
    const { storage } = fakeStorage()
    const rail = createDeviceRail(storage)
    rail.write(true)
    expect(rail.read()).toBe(true)
  })

  test('takes the entry away rather than storing an unfolded rail', () => {
    const { storage, held } = fakeStorage()
    const rail = createDeviceRail(storage)
    rail.write(true)
    rail.write(false)
    expect(held.size).toBe(0)
    expect(rail.read()).toBe(false)
  })

  /* A first visit gets a rail with its words on. */
  test('is unfolded where nothing has been kept', () => {
    expect(createDeviceRail(fakeStorage().storage).read()).toBe(false)
    expect(createDeviceRail(null).read()).toBe(false)
  })

  /* Reading storage throws outright in a browser with site data blocked, and
     the rail still has to draw. */
  test('survives a browser that will not answer', () => {
    const rail = createDeviceRail(throwing)
    expect(rail.read()).toBe(false)
    expect(() => rail.write(true)).not.toThrow()
  })

  /* Anything but the one word this writes is an unfolded rail, because what is
     in there arrived from a console as easily as from the arrow. */
  test('reads anything else as unfolded', () => {
    const { storage, held } = fakeStorage()
    held.set('pm:rail-collapsed', 'yes please')
    expect(createDeviceRail(storage).read()).toBe(false)
  })
})
