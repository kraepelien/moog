import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '../server/db.ts'
import { syncInstruments } from '../server/factory.ts'
import { createLibrary } from '../server/repositories/library.ts'
import { createRepositories } from '../server/repositories/index.ts'
import { createUsers } from '../server/repositories/users.ts'
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
  const store = createRepositories(db)

  const person = (uid: string) =>
    createUsers(db).ensure({ uid, provider: 'test', subject: uid, displayName: uid.toUpperCase() })

  const patch = (name: string, owner: number, visibility: Visibility = 'private'): Patch => {
    const made = createPatch({ name, visibility, tags: ['Bass'] })
    store.patches.put(made.id, made, owner)
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
    store.patches.putPreset('sub-bass', { ...createPatch({ name: 'Sub Bass', visibility: 'public' }), id: 'sub-bass' })

    expect(createLibrary(db).entriesFor(me.id).map((row) => row.name).sort()).toEqual([
      'MINE',
      'SUB BASS',
      'THEIRS, SHARED',
    ])
  })

  test('says which are theirs and who made the rest', () => {
    const { db, person, patch } = library()
    const me = person('me')
    const them = person('them')
    patch('Mine', me.id)
    patch('Theirs', them.id, 'public')

    const rows = createLibrary(db).entriesFor(me.id)
    expect(rows.find((row) => row.name === 'MINE')).toMatchObject({ mine: true, origin: 'user' })
    expect(rows.find((row) => row.name === 'THEIRS')).toMatchObject({
      mine: false,
      ownerName: 'THEM',
    })
  })

  test('a factory row has no owner and says where it came from', () => {
    const { db, store, person } = library()
    const me = person('me')
    store.patches.putPreset('sub-bass', {
      ...createPatch({ name: 'Sub Bass', visibility: 'public', approximate: true }),
      id: 'sub-bass',
    })

    expect(createLibrary(db).entriesFor(me.id)[0]).toMatchObject({
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
    store.patches.delete(gone.id)

    expect(createLibrary(db).entriesFor(me.id)).toEqual([])
  })

  test('only the instrument asked for', () => {
    const { db, person, patch } = library()
    const me = person('me')
    patch('Model D', me.id)

    expect(createLibrary(db).entriesFor(me.id, 'minimoog-model-d')).toHaveLength(1)
    expect(createLibrary(db).entriesFor(me.id, 'prophet-5')).toEqual([])
  })

  test('nothing of anyone else when signed out', () => {
    /* Nobody has a viewer id, so only what everyone may see is left. */
    const { db, person, patch } = library()
    patch('Private', person('them').id)
    expect(createLibrary(db).entriesFor(null)).toEqual([])
  })
})

describe('the ratings on a row', () => {
  test('are mine, and everyone else averaged beside them', () => {
    const { db, store, person, patch } = library()
    const me = person('me')
    const them = person('them')
    const third = person('third')
    const shared = patch('Shared', me.id, 'public')

    store.ratings.set(me.id, shared.id, 5)
    store.ratings.set(them.id, shared.id, 4)
    store.ratings.set(third.id, shared.id, 3)

    const row = createLibrary(db).entriesFor(me.id)[0]!
    expect(row.rating).toBe(5)
    expect(row.averageRating).toBe(4)
    expect(row.ratingCount).toBe(3)
  })

  test('are null where I have not rated, with the average still shown', () => {
    const { db, store, person, patch } = library()
    const me = person('me')
    const them = person('them')
    const shared = patch('Shared', me.id, 'public')
    store.ratings.set(them.id, shared.id, 2)

    const row = createLibrary(db).entriesFor(me.id)[0]!
    expect(row.rating).toBeNull()
    expect(row.averageRating).toBe(2)
  })

  test('say nothing at all about a patch nobody has rated', () => {
    const { db, person, patch } = library()
    const me = person('me')
    patch('Unrated', me.id)

    const row = createLibrary(db).entriesFor(me.id)[0]!
    expect(row.rating).toBeNull()
    expect(row.averageRating).toBeNull()
    expect(row.ratingCount).toBe(0)
  })

  test('round to the half star the stars can draw', () => {
    const { db, store, person, patch } = library()
    const me = person('me')
    const them = person('them')
    const shared = patch('Shared', me.id, 'public')
    store.ratings.set(me.id, shared.id, 5)
    store.ratings.set(them.id, shared.id, 2)

    expect(createLibrary(db).entriesFor(me.id)[0]!.averageRating).toBe(3.5)
  })

  test('carry a half star as it was given', () => {
    const { db, store, person, patch } = library()
    const me = person('me')
    const mine = patch('Half', me.id)
    store.ratings.set(me.id, mine.id, 2.5)

    const row = createLibrary(db).entriesFor(me.id)[0]!
    expect(row.rating).toBe(2.5)
    expect(row.averageRating).toBe(2.5)
  })

  test('never say what any one other person thought', () => {
    /* The average and the count cross between users; a rating does not. */
    const { db, store, person, patch } = library()
    const me = person('me')
    const them = person('them')
    const shared = patch('Shared', them.id, 'public')
    store.ratings.set(them.id, shared.id, 1)

    const row = createLibrary(db).entriesFor(me.id)[0]!
    expect(row.rating).toBeNull()
    expect(JSON.stringify(row)).not.toContain('"stars"')
  })
})
