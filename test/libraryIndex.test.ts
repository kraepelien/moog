import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '../server/db.ts'
import { syncInstruments } from '../server/factory.ts'
import { buildLibrary } from '../server/library.ts'
import { createStore } from '../server/store.ts'
import { ensureUser } from '../server/users.ts'
import { createPatch, type Patch, type Visibility } from '../src/patch/schema.ts'

/* One row per patch the viewer may see, with my rating and everyone's average
   on it. The average is the part that cannot be assembled in the browser: it
   needs rows nobody but the server may read. */

const roots: string[] = []

function library() {
  const root = mkdtempSync(join(tmpdir(), 'moog-library-'))
  roots.push(root)
  const db = openDatabase(join(root, 'moog.db'))
  syncInstruments(db)
  const store = createStore(db)

  const person = (uid: string) =>
    ensureUser(db, { uid, provider: 'test', subject: uid, displayName: uid.toUpperCase() })

  const patch = (name: string, owner: number, visibility: Visibility = 'private'): Patch => {
    const made = createPatch({ name, visibility, tags: ['Bass'] })
    store.putPatch(made.id, made, owner)
    return made
  }

  return { db, store, person, patch }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('what a viewer is shown', () => {
  test('their own, anyone public, and the bank — but not somebody else private', () => {
    const { db, store, person, patch } = library()
    const me = person('me')
    const them = person('them')

    patch('Mine', me.id)
    patch('Theirs, shared', them.id, 'public')
    patch('Theirs, secret', them.id, 'private')
    store.putPreset('sub-bass', { ...createPatch({ name: 'Sub Bass', visibility: 'public' }), id: 'sub-bass' })

    expect(buildLibrary(db, me.id).map((row) => row.name).sort()).toEqual([
      'Mine',
      'Sub Bass',
      'Theirs, shared',
    ])
  })

  test('says which are theirs and who made the rest', () => {
    const { db, person, patch } = library()
    const me = person('me')
    const them = person('them')
    patch('Mine', me.id)
    patch('Theirs', them.id, 'public')

    const rows = buildLibrary(db, me.id)
    expect(rows.find((row) => row.name === 'Mine')).toMatchObject({ mine: true, origin: 'user' })
    expect(rows.find((row) => row.name === 'Theirs')).toMatchObject({
      mine: false,
      ownerName: 'THEM',
    })
  })

  test('a factory row has no owner and says where it came from', () => {
    const { db, store, person } = library()
    const me = person('me')
    store.putPreset('sub-bass', {
      ...createPatch({ name: 'Sub Bass', visibility: 'public', approximate: true }),
      id: 'sub-bass',
    })

    expect(buildLibrary(db, me.id)[0]).toMatchObject({
      id: 'sub-bass',
      origin: 'factory',
      mine: false,
      ownerName: null,
      approximate: true,
    })
  })

  test('nothing deleted', () => {
    const { db, store, person, patch } = library()
    const me = person('me')
    const gone = patch('Gone', me.id)
    store.deletePatch(gone.id)

    expect(buildLibrary(db, me.id)).toEqual([])
  })

  test('only the instrument asked for', () => {
    const { db, person, patch } = library()
    const me = person('me')
    patch('Model D', me.id)

    expect(buildLibrary(db, me.id, 'minimoog-model-d')).toHaveLength(1)
    expect(buildLibrary(db, me.id, 'prophet-5')).toEqual([])
  })

  test('nothing of anyone else when signed out', () => {
    /* Nobody has a viewer id, so only what everyone may see is left. */
    const { db, person, patch } = library()
    patch('Private', person('them').id)
    expect(buildLibrary(db, null)).toEqual([])
  })
})

describe('the ratings on a row', () => {
  test('are mine, and everyone else averaged beside them', () => {
    const { db, store, person, patch } = library()
    const me = person('me')
    const them = person('them')
    const third = person('third')
    const shared = patch('Shared', me.id, 'public')

    store.setRating(me.id, shared.id, 5)
    store.setRating(them.id, shared.id, 4)
    store.setRating(third.id, shared.id, 3)

    const row = buildLibrary(db, me.id)[0]!
    expect(row.rating).toBe(5)
    expect(row.averageRating).toBe(4)
    expect(row.ratingCount).toBe(3)
  })

  test('are null where I have not rated, with the average still shown', () => {
    const { db, store, person, patch } = library()
    const me = person('me')
    const them = person('them')
    const shared = patch('Shared', me.id, 'public')
    store.setRating(them.id, shared.id, 2)

    const row = buildLibrary(db, me.id)[0]!
    expect(row.rating).toBeNull()
    expect(row.averageRating).toBe(2)
  })

  test('say nothing at all about a patch nobody has rated', () => {
    const { db, person, patch } = library()
    const me = person('me')
    patch('Unrated', me.id)

    const row = buildLibrary(db, me.id)[0]!
    expect(row.rating).toBeNull()
    expect(row.averageRating).toBeNull()
    expect(row.ratingCount).toBe(0)
  })

  test('round to the half star the stars can draw', () => {
    const { db, store, person, patch } = library()
    const me = person('me')
    const them = person('them')
    const shared = patch('Shared', me.id, 'public')
    store.setRating(me.id, shared.id, 5)
    store.setRating(them.id, shared.id, 2)

    expect(buildLibrary(db, me.id)[0]!.averageRating).toBe(3.5)
  })

  test('never say what any one other person thought', () => {
    /* The average and the count cross between users; a rating does not. */
    const { db, store, person, patch } = library()
    const me = person('me')
    const them = person('them')
    const shared = patch('Shared', them.id, 'public')
    store.setRating(them.id, shared.id, 1)

    const row = buildLibrary(db, me.id)[0]!
    expect(row.rating).toBeNull()
    expect(JSON.stringify(row)).not.toContain('"stars"')
  })
})
