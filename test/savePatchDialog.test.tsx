import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  SavePatchDialog,
  type PatchFields,
  type SaveOutcome,
} from '../src/components/library/SavePatchDialog.tsx'
import { createPatch, type Patch } from '../src/patch/schema.ts'
import { fixedIdentity } from './fixtures.ts'

/* Driven rather than called: the form's job is to start from the patch, collect
   an edit and hand it back untouched, and none of that is visible to a test that
   only checks the shape it returns. */

afterEach(cleanup)

function patchWith(fields: Partial<Patch> = {}): Patch {
  return { ...createPatch({ name: 'Sub Bass' }, fixedIdentity('p')), ...fields }
}

function renderDialog(patch: Patch = patchWith(), open = true, outcome: SaveOutcome = 'overwrite') {
  const saved: PatchFields[] = []
  let cancelled = 0
  const view = render(
    <SavePatchDialog
      open={open}
      patch={patch}
      outcome={outcome}
      tagChoices={['bass', 'lead']}
      onCancel={() => (cancelled += 1)}
      onSave={(fields) => saved.push(fields)}
    />,
  )
  return { saved, cancelled: () => cancelled, view }
}

function save() {
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
}

describe('the form starts from the patch', () => {
  test('the name is the one being saved', () => {
    renderDialog()
    expect(screen.getByLabelText<HTMLInputElement>('Patch name').value).toBe('SUB BASS')
  })

  test('a tag the patch already wears is switched on', () => {
    const { saved } = renderDialog(patchWith({ tags: ['bass'] }))
    save()
    expect(saved[0]!.tags).toEqual(['bass'])
  })
})

describe('editing', () => {
  test('a new name is handed back', () => {
    const { saved } = renderDialog()
    fireEvent.change(screen.getByLabelText('Patch name'), { target: { value: 'Fat Bass' } })
    save()
    expect(saved[0]!.name).toBe('FAT BASS')
  })

  /* The field drew capitals in CSS and handed back what was typed, so a name
     entered here was the one place a patch kept a lower-case name. */
  test('a name typed in lower case is capitals in the field and in what is saved', () => {
    const { saved } = renderDialog()
    fireEvent.change(screen.getByLabelText('Patch name'), { target: { value: 'fat bass' } })

    expect(screen.getByLabelText<HTMLInputElement>('Patch name').value).toBe('FAT BASS')
    save()
    expect(saved[0]!.name).toBe('FAT BASS')
  })

  test('the notes are handed back', () => {
    const { saved } = renderDialog()
    fireEvent.change(screen.getByLabelText('Patch notes'), { target: { value: 'filter wide' } })
    save()
    expect(saved[0]!.notes).toBe('filter wide')
  })

  test('pressing a category adds it and pressing it again takes it away', () => {
    const { saved } = renderDialog()
    const lead = screen.getByRole('button', { name: 'lead' })
    fireEvent.click(lead)
    save()
    expect(saved[0]!.tags).toEqual(['lead'])

    fireEvent.click(lead)
    save()
    expect(saved[1]!.tags).toEqual([])
  })

  /* An admin can retire a tag, and the patches wearing it keep it. */
  test('a tag the list no longer offers is still shown, and can be taken off', () => {
    const { saved } = renderDialog(patchWith({ tags: ['disco'] }))
    const retired = screen.getByRole('button', { name: 'disco' })

    fireEvent.click(retired)
    save()
    expect(saved[0]!.tags).toEqual([])
  })

  test('Public turns visibility on and off', () => {
    const { saved } = renderDialog()
    const chip = screen.getByRole('button', { name: 'Public' })
    fireEvent.click(chip)
    save()
    expect(saved[0]!.visibility).toBe('public')

    fireEvent.click(chip)
    save()
    expect(saved[1]!.visibility).toBe('private')
  })

  /* Which bank a patch belongs to is the server's to decide, so the chip saying
     so is a label; pressing it must not quietly change what is saved. */
  test('the User chip is not a button', () => {
    renderDialog()
    expect(screen.queryByRole('button', { name: 'User' })).toBeNull()
    expect(screen.getByText('User')).toBeTruthy()
  })

  test('the instrument stays set when its own chip is pressed', () => {
    const { saved } = renderDialog()
    const before = screen.getByLabelText('Patch name')
    expect(before).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Minimoog Model D' }))
    save()
    expect(saved[0]!.instrument).toBe('minimoog-model-d')
  })
})

describe('leaving without saving', () => {
  test('Cancel reports and hands nothing back', () => {
    const { saved, cancelled } = renderDialog()
    fireEvent.change(screen.getByLabelText('Patch name'), { target: { value: 'Discarded' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(cancelled()).toBe(1)
    expect(saved).toEqual([])
  })

  /* The bug the render-time refill exists for: abandon an edit, open the same
     patch again, and the box must not still hold what was abandoned. */
  test('reopening the same patch forgets an abandoned edit', () => {
    const patch = patchWith()
    const { view } = renderDialog(patch)
    fireEvent.change(screen.getByLabelText('Patch name'), { target: { value: 'Abandoned' } })

    view.rerender(
      <SavePatchDialog
        open={false}
        patch={patch}
        outcome="overwrite"
        tagChoices={['bass', 'lead']}
        onCancel={() => {}}
        onSave={() => {}}
      />,
    )
    view.rerender(
      <SavePatchDialog
        open
        patch={patch}
        outcome="overwrite"
        tagChoices={['bass', 'lead']}
        onCancel={() => {}}
        onSave={() => {}}
      />,
    )

    expect(screen.getByLabelText<HTMLInputElement>('Patch name').value).toBe('SUB BASS')
  })
})

/* The same press creates or overwrites depending on whose patch is open, and
   the server is the only thing that knows which — by the time it refuses, the
   form has been filled in. So the form says which it will be, before it. */
describe('saying what saving will do', () => {
  test('a patch of my own is written over, and says so', () => {
    renderDialog()
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
    expect(screen.getByText(/writes over the patch you opened/)).toBeTruthy()
  })

  test('a copy is called Duplicate and names what it was copied from', () => {
    const copied = patchWith({
      derivedFrom: {
        id: 'sub-bass',
        name: 'Sub Bass',
        kind: 'factory',
        ownerId: null,
        ownerName: null,
        at: '2026-01-01T00:00:00.000Z',
      },
    })
    const { saved } = renderDialog(copied, true, 'duplicate')
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(screen.getByText(/“Sub Bass” is left as it is/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }))
    expect(saved).toHaveLength(1)
  })

  test('a draft that has never been saved is neither', () => {
    renderDialog(patchWith(), true, 'new')
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
    expect(screen.getByText(/has not been saved before/)).toBeTruthy()
  })
})
