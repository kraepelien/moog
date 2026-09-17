import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { openDatabase } from '../server/db.ts'
import { createTags } from '../server/repositories/tags.ts'
import { INITIAL_TAGS, seedTags } from '../server/services/tags.ts'
import { testApi, type TestApi } from './apiFixture.ts'

/* What these pin is the difference between the tag list and the instrument
   list. Instruments are code and are re-asserted on every start; categories are
   somebody's editorial list, so the seed is a starting point an admin owns
   afterwards. Getting that wrong is invisible until a deleted tag reappears. */

describe('the starting vocabulary', () => {
  test('a new database gets the initial categories', () => {
    const db = openDatabase(':memory:')
    expect(seedTags(db)).toBe(INITIAL_TAGS.length)
    expect(createTags(db).list().map((tag) => tag.name)).toEqual([...INITIAL_TAGS].sort())
  })

  test('starting again writes nothing a second time', () => {
    const db = openDatabase(':memory:')
    seedTags(db)
    expect(seedTags(db)).toBe(0)
    expect(createTags(db).list()).toHaveLength(INITIAL_TAGS.length)
  })

  /* The reason this is a seed and not a sync: an admin page that cannot delete
     anything for longer than one restart is an admin page that does not work. */
  test('a category an admin deletes stays deleted across a restart', () => {
    const db = openDatabase(':memory:')
    seedTags(db)
    db.run(`delete from tags where name = 'Drones'`)

    seedTags(db)
    expect(createTags(db).list().map((tag) => tag.name)).not.toContain('Drones')
  })

  test("an admin's own category is kept and sorts in among the rest", () => {
    const db = openDatabase(':memory:')
    seedTags(db)
    db.run(`insert into tags (name, created_at) values ('Choir', ?)`, [new Date().toISOString()])

    const names = createTags(db).list().map((tag) => tag.name)
    expect(names).toContain('Choir')
    expect(names.indexOf('Choir')).toBeLessThan(names.indexOf('Drones'))
  })
})

describe('the app asks the server for them', () => {
  let api: TestApi

  beforeEach(() => {
    api = testApi()
  })
  afterEach(() => {
    api.cleanup()
  })

  test('names come back through the adapter the browser uses', async () => {
    seedTags(api.db)
    expect(await api.store.listTags()).toEqual([...INITIAL_TAGS].sort())
  })

  /* A bank nobody has tagged still has a vocabulary to offer, which is the
     whole reason the list is not derived from what patches wear. */
  test('the list does not depend on any patch wearing a tag', async () => {
    seedTags(api.db)
    expect(await api.store.list()).toEqual([])
    expect((await api.store.listTags()).length).toBe(INITIAL_TAGS.length)
  })
})
