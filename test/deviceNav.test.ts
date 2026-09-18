import { describe, expect, test } from 'bun:test'
import { createDeviceNav } from '@storage/deviceNav.ts'
import type { StorageLike } from '@storage/deviceSkin.ts'

/* Which way the nav was asked to run. Driven through a fake rather than a real
   Storage: Bun's runtime has none, which is the reason the adapter takes one as
   a parameter. */

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

describe('keeping the menu on top', () => {
  test('gives back what it was given', () => {
    const nav = createDeviceNav(fakeStorage().storage)
    nav.write('top')
    expect(nav.read()).toBe('top')
  })

  test('takes the entry away rather than storing a nav that follows the window', () => {
    const { storage, held } = fakeStorage()
    const nav = createDeviceNav(storage)
    nav.write('top')
    nav.write('window')
    expect(held.size).toBe(0)
    expect(nav.read()).toBe('window')
  })

  /* A first visit gets the rail on a screen with room for one. */
  test('follows the window where nothing has been kept', () => {
    expect(createDeviceNav(fakeStorage().storage).read()).toBe('window')
    expect(createDeviceNav(null).read()).toBe('window')
  })

  /* Reading storage throws outright in a browser with site data blocked, and
     the nav still has to draw. */
  test('survives a browser that will not answer', () => {
    const nav = createDeviceNav(throwing)
    expect(nav.read()).toBe('window')
    expect(() => nav.write('top')).not.toThrow()
  })

  /* Anything but the one word this writes follows the window, because what is in
     there arrived from a console as easily as from the setting. */
  test('reads anything else as following the window', () => {
    const { storage, held } = fakeStorage()
    held.set('moog:nav-top', 'yes please')
    expect(createDeviceNav(storage).read()).toBe('window')
  })
})
