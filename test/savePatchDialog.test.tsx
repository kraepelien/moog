import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  SavePatchDialog,
  type PatchFields,
  type SaveOutcome,
} from '@components/library/SavePatchDialog.tsx'
import { createPatch, type Patch } from '@patch/schema.ts'
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
    expect(screen.getByLabelText<HTMLInputElement>('Patch name').value).toBe('Sub Bass')
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
    expect(saved[0]!.name).toBe('Fat Bass')
  })

  /* The field is set in capitals by its stylesheet. That is typesetting and
     stops at the glass: what leaves the form is what was typed, or the letters
     somebody chose would survive nowhere. */
  test('a name typed in lower case is saved in lower case', () => {
    const { saved } = renderDialog()
    fireEvent.change(screen.getByLabelText('Patch name'), { target: { value: 'fat bass' } })

    expect(screen.getByLabelText<HTMLInputElement>('Patch name').value).toBe('fat bass')
    save()
    expect(saved[0]!.name).toBe('fat bass')
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

  /* A patch is saved public, so the chip starts on and pressing it is how one is
     kept back. */
  test('Public turns visibility off and on again', () => {
    const { saved } = renderDialog()
    const chip = screen.getByRole('button', { name: 'Public' })
    save()
    expect(saved[0]!.visibility).toBe('public')

    fireEvent.click(chip)
    save()
    expect(saved[1]!.visibility).toBe('private')

    fireEvent.click(chip)
    save()
    expect(saved[2]!.visibility).toBe('public')
  })

  test('a patch already kept private opens with Public off', () => {
    const { saved } = renderDialog(patchWith({ visibility: 'private' }))
    save()
    expect(saved[0]!.visibility).toBe('private')
  })

  /* Which bank a patch belongs to is the server's to decide, so the chip saying
     so is a label; pressing it must not quietly change what is saved. */
  test('the User chip is not a button', () => {
    renderDialog()
    expect(screen.queryByRole('button', { name: 'User' })).toBeNull()
    expect(screen.getByText('User')).toBeTruthy()
  })

  /* The editor a patch was made in is the instrument it is for, so the form says
     which one and does not ask — and must not offer a way to answer wrongly. */
  test('the synth is shown and is not a button', () => {
    renderDialog()
    expect(screen.getByText('Minimoog Model D')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Minimoog Model D' })).toBeNull()
  })

  /* Every patch in the factory bank is a reconstruction and no other patch is
     one, so the bank chip says it and this form does not say it again. */
  test('an approximation is not chipped a second time', () => {
    renderDialog(patchWith({ approximate: true }))
    expect(screen.queryByText('approximate')).toBeNull()
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

    expect(screen.getByLabelText<HTMLInputElement>('Patch name').value).toBe('Sub Bass')
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

/* The stars are here rather than over the panel: the editor is where a patch is
   played, and this is the one place it is looked at. */
describe('the stars', () => {
  function renderRated(onRate?: (stars: number) => void) {
    render(
      <SavePatchDialog
        open
        patch={patchWith()}
        outcome="overwrite"
        tagChoices={[]}
        rating={null}
        average={3.5}
        ratingCount={2}
        onCancel={() => {}}
        onRate={onRate}
        onSave={() => {}}
      />,
    )
  }

  test('can be pressed on a patch the server holds', () => {
    const rated: number[] = []
    renderRated((stars) => rated.push(stars))

    expect(screen.getByText('3.5 (2)')).toBeDefined()
    fireEvent.click(screen.getByRole('radio', { name: '5 Stars' }))
    expect(rated).toEqual([5])
  })

  test('are shown but not offered on a draft that has never been saved', () => {
    renderRated(undefined)

    expect(screen.getByLabelText('Average rating for Sub Bass')).toBeDefined()
    expect(screen.queryAllByRole('radio')).toEqual([])
  })
})
