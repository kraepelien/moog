import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ROLE } from '@access/privileges.ts'
import { openDatabase } from '@server/db.ts'
import { createRepositories } from '@server/repositories/index.ts'
import { syncInstruments } from '@server/factory.ts'
import { windBackTo } from './oldDatabase.ts'

/* A database written before roles existed. What matters is that upgrading one
   changes nobody's access: the build before this gave the local user admin
   unconditionally and let anyone who could sign in do everything a member now
   does, so that is what the backfill has to produce. */

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function databaseWithoutRoles() {
  const root = mkdtempSync(join(tmpdir(), 'moog-upgrade-'))
  roots.push(root)
  const path = join(root, 'moog.db')

  const db = openDatabase(path)
  syncInstruments(db)
  const users = createRepositories(db).users
  users.ensureLocal('local')
  users.ensure({ uid: 'u-1', provider: 'google', subject: '1', email: 'someone@example.com' })

  /* Back to just before roles, which is the only way to get a row this
     migration has not already seen. */
  windBackTo(db, 2)
  db.close()

  return path
}

describe('upgrading a database written before roles', () => {
  test('gives everybody who could sign in the member role', () => {
    const db = openDatabase(databaseWithoutRoles())
    const users = createRepositories(db).users

    expect(users.rolesOf(users.find('u-1')!)).toEqual([ROLE.member])
    db.close()
  })

  test('leaves the local user the admin it already was', () => {
    const db = openDatabase(databaseWithoutRoles())
    const users = createRepositories(db).users

    expect(users.rolesOf(users.find('local')!)).toContain(ROLE.admin)
    db.close()
  })

  test('runs once, so a second open does not rewrite a revoked role', () => {
    const path = databaseWithoutRoles()

    const first = openDatabase(path)
    createRepositories(first).users.revoke('local', ROLE.admin)
    first.close()

    const second = openDatabase(path)
    const users = createRepositories(second).users
    expect(users.rolesOf(users.find('local')!)).not.toContain(ROLE.admin)
    second.close()
  })
})
