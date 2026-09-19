import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TrashPage } from '@components/TrashPage.tsx'
import type { PatchRecord } from '@patch/record.ts'

afterEach(cleanup)

const DAY = 24 * 60 * 60 * 1000

function deleted(over: Partial<PatchRecord> = {}): PatchRecord {
  return {
    id: 'p1',
    name: 'Sub Bass',
    origin: 'user',
    ownerUid: 'u-mine',
    ownerName: 'Me',
    tags: ['BASS'],
    instrument: 'minimoog-model-d',
    visibility: 'private',
    updatedAt: '2026-02-01T00:00:00.000Z',
    deletedAt: '2026-02-01T00:00:00.000Z',
    purgeAt: new Date(Date.now() + 12 * DAY).toISOString(),
    ...over,
  }
}

function show(records: readonly PatchRecord[]) {
  const restored: string[] = []
  render(<TrashPage records={records} onRestore={(one) => restored.push(one.id)} />)
  return restored
}

describe('a trash with something in it', () => {
  test('names the patch and how long it has left', () => {
    show([deleted()])
    expect(screen.getByText('Sub Bass')).toBeTruthy()
    expect(screen.getByText('12 days left')).toBeTruthy()
  })

  test('puts one back when asked', () => {
    const restored = show([deleted()])
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    expect(restored).toEqual(['p1'])
  })

  test('reads the last day as a day rather than as none', () => {
    show([deleted({ purgeAt: new Date(Date.now() + 0.5 * DAY).toISOString() })])
    expect(screen.getByText('gone tomorrow')).toBeTruthy()
  })

  /* Only `bun run serve` sweeps, once a day, and the dev server never does, so
     a row outliving its own date is a real state rather than a bug. */
  test('says a row past its date is due rather than showing a negative', () => {
    show([deleted({ purgeAt: new Date(Date.now() - 2 * DAY).toISOString() })])
    expect(screen.getByText('due to be removed')).toBeTruthy()
  })
})

describe('an empty trash', () => {
  test('says so, and offers no table to read', () => {
    show([])
    expect(screen.getByText(/Nothing you have deleted/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull()
  })
})
