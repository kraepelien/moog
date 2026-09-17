import { describe, expect, test } from 'bun:test'
import { createDeviceSkin, type StorageLike } from '@storage/deviceSkin.ts'

/* The preview's memory. Driven through a fake rather than a real Storage: Bun's
   runtime has none, which is the reason the adapter takes one as a parameter. */

function fakeStorage(seed?: string) {
  const held = new Map<string, string>()
  if (seed !== undefined) held.set('moog:skin', seed)
  return {
    held,
    storage: {
      getItem: (key: string) => held.get(key) ?? null,
      setItem: (key: string, value: string) => void held.set(key, value),
      removeItem: (key: string) => void held.delete(key),
    } satisfies StorageLike,
  }
}

/* Every method, because which one throws differs by browser and by why. */
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

describe('keeping a preview on the device', () => {
  test('gives back what it was given', () => {
    const { storage } = fakeStorage()
    const device = createDeviceSkin(storage)
    expect(device.write({ card: '#123456' })).toBe(true)
    expect(device.read()).toEqual({ card: '#123456' })
  })

  test('takes the entry away rather than storing an empty skin', () => {
    const { storage, held } = fakeStorage()
    const device = createDeviceSkin(storage)
    device.write({ card: '#123456' })
    device.write({})
    expect(held.size).toBe(0)
    expect(device.read()).toEqual({})
  })

  test('reads nothing as the defaults', () => {
    expect(createDeviceSkin(fakeStorage().storage).read()).toEqual({})
  })
})

describe('an entry it did not write', () => {
  test.each([
    ['not JSON at all', 'wallpaper'],
    ['JSON that is not an object', '"#fff"'],
    ['null', 'null'],
    ['an array', '[1,2]'],
  ])('reads %s as the defaults', (_label, seed) => {
    expect(createDeviceSkin(fakeStorage(seed).storage).read()).toEqual({})
  })

  /* This lands in a style attribute before the first render, so a hand-edited
     entry is the same untrusted input a request body was. */
  test('keeps the colours and drops everything else', () => {
    const seed = '{"page":"rebeccapurple","card":"#0E0E11","wallpaper":"#ffffff"}'
    expect(createDeviceSkin(fakeStorage(seed).storage).read()).toEqual({ card: '#0e0e11' })
  })
})

describe('a browser that will not keep anything', () => {
  test('reads as the defaults rather than throwing', () => {
    expect(createDeviceSkin(throwing).read()).toEqual({})
  })

  test('says so instead of throwing, so the page can tell somebody', () => {
    expect(createDeviceSkin(throwing).write({ card: '#123456' })).toBe(false)
  })

  test('is the same answer when there is no storage at all', () => {
    const device = createDeviceSkin(null)
    expect(device.read()).toEqual({})
    expect(device.write({ card: '#123456' })).toBe(false)
  })
})
