import { describe, expect, test } from 'bun:test'
import {
  formatRoles,
  grants,
  isPrivilege,
  parseRoles,
  privilegesOf,
  PRIVILEGE,
  ROLE,
} from '../src/access/privileges.ts'

describe('reading roles off a row', () => {
  test('takes the names it knows and drops the rest', () => {
    expect(parseRoles('admin,member')).toEqual([ROLE.admin, ROLE.member])
    /* A column written by a newer build must not stop an older one answering. */
    expect(parseRoles('member,curator')).toEqual([ROLE.member])
  })

  test('tolerates spacing, repeats and an empty column', () => {
    expect(parseRoles(' admin , member , admin ')).toEqual([ROLE.admin, ROLE.member])
    expect(parseRoles('')).toEqual([])
    expect(parseRoles(null)).toEqual([])
  })

  test('round-trips through the column', () => {
    expect(parseRoles(formatRoles([ROLE.admin, ROLE.member]))).toEqual([ROLE.admin, ROLE.member])
  })
})

describe('what a role grants', () => {
  test('a member may store MIDI and nothing administrative', () => {
    expect(grants([ROLE.member], PRIVILEGE.StoreMidi)).toBe(true)
    expect(grants([ROLE.member], PRIVILEGE.AccessAdmin)).toBe(false)
    expect(grants([ROLE.member], PRIVILEGE.AdminTags)).toBe(false)
    expect(grants([ROLE.member], PRIVILEGE.AdminPatches)).toBe(false)
  })

  test('an admin holds the member set too, rather than inheriting it', () => {
    expect(grants([ROLE.admin], PRIVILEGE.StoreMidi)).toBe(true)
    expect(grants([ROLE.admin], PRIVILEGE.AccessAdmin)).toBe(true)
  })

  test('holding no role grants nothing', () => {
    expect(privilegesOf([])).toEqual([])
    expect(grants([], PRIVILEGE.StoreMidi)).toBe(false)
  })

  test('the set is the union, counted once', () => {
    const held = privilegesOf([ROLE.admin, ROLE.member])
    expect(new Set(held).size).toBe(held.length)
    expect(held).toContain(PRIVILEGE.StoreMidi)
  })
})

describe('a privilege name', () => {
  test('is only one this build knows', () => {
    expect(isPrivilege(PRIVILEGE.AdminTags)).toBe(true)
    expect(isPrivilege('AdminEverything')).toBe(false)
    expect(isPrivilege(null)).toBe(false)
  })
})
