import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import { OpsPage } from '@admin/OpsPage.tsx'
import type { OpsReport } from '@admin/ops.ts'
import { LIMIT_ENV, limitsFromEnv } from '@server/limits.ts'

afterEach(cleanup)

const BASE: OpsReport = {
  startedAt: '2026-02-03T08:00:00.000Z',
  scheduled: true,
  everyHours: 24,
  backup: {
    at: '2026-02-03T08:00:01.000Z',
    path: 'data/backups/moog-2026-02-03.db',
    ok: true,
    error: null,
  },
  purge: { at: '2026-02-03T08:00:00.500Z', removed: 2, olderThan: '2026-01-04T08:00:00.000Z' },
  factory: { loaded: 0, kept: 44, retired: 0, refreshed: false },
  database: { path: 'data/moog.db', bytes: 2_097_152 },
  limits: limitsFromEnv({}),
  limitEnv: LIMIT_ENV,
}

const show = (over: Partial<OpsReport> = {}) => render(<OpsPage report={{ ...BASE, ...over }} />)

describe('a server that runs its own housekeeping', () => {
  test('says when the last copy was written, and where it went', () => {
    show()
    expect(screen.getByText('data/backups/moog-2026-02-03.db')).toBeTruthy()
  })

  test('says what the last sweep removed, and what it measured against', () => {
    show()
    expect(screen.getByText(/2 deleted before/)).toBeTruthy()
  })

  /* `setInterval` counts from process start, so an operator expecting a
     wall-clock hour would be wrong about when the next run falls. */
  test('says the clock runs from startup rather than from a fixed hour', () => {
    show()
    expect(screen.getByText(/not at a fixed hour of the day/)).toBeTruthy()
  })

  test('draws a failed backup as failed, with what went wrong', () => {
    show({
      backup: {
        at: '2026-02-03T08:00:01.000Z',
        path: 'data/backups/moog-2026-02-03.db',
        ok: false,
        error: 'read-only file system',
      },
    })
    expect(screen.getByText(/failed at/)).toBeTruthy()
    expect(screen.getByText('read-only file system')).toBeTruthy()
  })
})

/* The dev server's case, and the one worth getting right: a zero would read as
   a backup that ran and copied nothing. */
describe('a process that takes no backups', () => {
  test('says so, in words', () => {
    show({ scheduled: false, backup: null, purge: null })
    expect(screen.getByText('Nothing here takes backups')).toBeTruthy()
  })

  test('and shows no figures at all rather than dashes standing in for them', () => {
    show({ scheduled: false, backup: null, purge: null })
    expect(screen.queryByText(/Last backup/)).toBeNull()
    expect(screen.queryByText(/Last trash sweep/)).toBeNull()
  })

  /* Both entry points seed the bank, so this half of the page is real under the
     dev server even though the maintenance half is not. */
  test('still reports the bank, which it did seed', () => {
    show({ scheduled: false, backup: null, purge: null })
    expect(screen.getByText('44')).toBeTruthy()
  })
})

describe('the limits', () => {
  test('names the variable that sets each one', () => {
    show()
    expect(screen.getByText('MOOG_TRASH_DAYS')).toBeTruthy()
    expect(screen.getByText('MOOG_WRITES_PER_MINUTE')).toBeTruthy()
  })

  /* Configuration is worth seeing; credentials are not, and a page that showed
     them would be a new reason to guard the page rather than a window onto the
     housekeeping. */
  test('says nothing about the credentials or who administers the install', () => {
    const { container } = show()
    expect(container.textContent).not.toContain('MOOG_ADMINS')
    expect(container.textContent).not.toContain('MOOG_OAUTH_CLIENT_ID')
    expect(container.textContent).not.toContain('MOOG_SESSION_SECRET')
  })
})

describe('before the report arrives', () => {
  test('says nothing rather than drawing an empty server', () => {
    render(<OpsPage report={null} />)
    expect(screen.queryByText('Maintenance')).toBeNull()
  })
})
