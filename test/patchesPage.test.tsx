import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PatchesPage } from '@admin/PatchesPage.tsx'
import { daysLeft, matchesPatch, type PatchRecord } from '@patch/record.ts'

afterEach(cleanup)

const DAY = 24 * 60 * 60 * 1000

function record(over: Partial<PatchRecord> = {}): PatchRecord {
  return {
    id: 'p1',
    name: 'Sub Bass',
    origin: 'user',
    ownerUid: 'u-theirs',
    ownerName: 'Grace',
    tags: ['BASS'],
    instrument: 'minimoog-model-d',
    visibility: 'private',
    updatedAt: '2026-02-01T00:00:00.000Z',
    deletedAt: null,
    purgeAt: null,
    ...over,
  }
}

const FACTORY = record({
  id: 'midnight-funk',
  name: 'Midnight Funk',
  origin: 'factory',
  ownerUid: null,
  ownerName: null,
  visibility: 'public',
})

function show(records: readonly PatchRecord[] = [record()]) {
  const edited: string[] = []
  const unpublished: string[] = []
  const deleted: string[] = []
  render(
    <PatchesPage
      records={records}
      onEdit={(one) => edited.push(one.id)}
      onUnpublish={(one) => unpublished.push(one.id)}
      onDelete={(one) => deleted.push(one.id)}
    />,
  )
  return { edited, unpublished, deleted }
}

const button = (name: string) => screen.queryByRole('button', { name })

describe('the list', () => {
  test('says who owns each patch, which nothing else in the app does', () => {
    show()
    expect(screen.getByText('Grace')).toBeTruthy()
  })

  test('searches names, owners and categories alike', () => {
    expect(matchesPatch(record(), 'grace')).toBe(true)
    expect(matchesPatch(record(), 'bass')).toBe(true)
    expect(matchesPatch(record(), 'lead')).toBe(false)
  })

  test('offers Edit and Delete on somebody else’s patch', () => {
    const { edited, deleted } = show()
    fireEvent.click(button('Edit')!)
    fireEvent.click(button('Delete')!)
    expect(edited).toEqual(['p1'])
    expect(deleted).toEqual(['p1'])
  })

  /* Only ever the one direction: putting somebody's private patch in front of
     everybody is a choice they did not make. */
  test('offers Unpublish on a published patch and nothing on a private one', () => {
    show([record({ visibility: 'public' })])
    expect(button('Unpublish')).toBeTruthy()
    cleanup()
    show([record({ visibility: 'private' })])
    expect(button('Unpublish')).toBeNull()
    expect(button('Publish')).toBeNull()
  })

  /* The bank is correctable and nothing else: a wrong transcription is what the
     rows being the live bank was for, and `mayRemove` still refuses the bank to
     everybody, so a Delete here would be a button whose only outcome is a 403. */
  test('offers a factory patch a correction, and nothing that would remove it', () => {
    const { edited } = show([FACTORY])

    expect(button('Delete')).toBeNull()
    expect(button('Unpublish')).toBeNull()

    fireEvent.click(button('Correct')!)
    expect(edited).toEqual(['midnight-funk'])
  })

  /* Correct rather than Edit, because it is not the same act: this one changes
     what everybody on the install loads. */
  test('names that button for what it does to the bank', () => {
    show([FACTORY])
    expect(button('Edit')).toBeNull()
    expect(button('Correct')).toBeTruthy()
  })
})

describe('the trash on the same page', () => {
  const deleted = record({
    deletedAt: '2026-02-01T00:00:00.000Z',
    purgeAt: new Date(Date.now() + 12 * DAY).toISOString(),
  })

  test('is hidden until it is asked for, and holds the deleted rows', () => {
    show([record(), deleted])
    expect(screen.getAllByText('Sub Bass')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: /In the trash/ }))
    expect(screen.getByText(/days left/)).toBeTruthy()
  })

  test('counts what is in it without being opened', () => {
    show([record(), deleted])
    expect(screen.getByRole('button', { name: /In the trash \(1\)/ })).toBeTruthy()
  })

  /* Only `bun run serve` sweeps, once a day, so a row can outlive its own date.
     A negative number would read as a bug rather than as a queue. */
  test('says a row past its date is due rather than printing a negative', () => {
    show([record({ deletedAt: '2020-01-01T00:00:00.000Z', purgeAt: '2020-01-31T00:00:00.000Z' })])
    fireEvent.click(screen.getByRole('button', { name: /In the trash/ }))
    expect(screen.getByText('due to be removed')).toBeTruthy()
  })
})

describe('how long a deleted patch has left', () => {
  test('rounds up, so the last day reads as a day rather than as none', () => {
    const now = Date.parse('2026-02-01T00:00:00.000Z')
    expect(daysLeft(new Date(now + 0.5 * DAY).toISOString(), now)).toBe(1)
    expect(daysLeft(new Date(now + 12 * DAY).toISOString(), now)).toBe(12)
  })

  test('goes negative once the sweep is overdue', () => {
    const now = Date.parse('2026-02-01T00:00:00.000Z')
    expect(daysLeft(new Date(now - 2 * DAY).toISOString(), now)).toBeLessThan(0)
  })

  test('answers nothing for a patch that is not deleted, or a date it cannot read', () => {
    expect(daysLeft(null)).toBeNull()
    expect(daysLeft('not a date')).toBeNull()
  })
})
