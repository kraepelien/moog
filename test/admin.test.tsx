import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AdminPage } from '@admin/AdminPage.tsx'
import type { TagInUse } from '@admin/tags.ts'

afterEach(cleanup)

const TAGS: readonly TagInUse[] = [
  { id: 1, name: 'Bass', patches: 7 },
  { id: 2, name: 'Lead', patches: 0 },
]

function renderPage(tags: readonly TagInUse[] = TAGS) {
  const added: string[] = []
  const removed: TagInUse[] = []
  render(
    <AdminPage
      tags={tags}
      onAdd={(name) => added.push(name)}
      onRemove={(tag) => removed.push(tag)}
    />,
  )
  return { added, removed }
}

const field = () => screen.getByLabelText('New tag') as HTMLInputElement
const type = (text: string) => fireEvent.change(field(), { target: { value: text } })
const addButton = () => screen.getByRole('button', { name: 'Add' })

describe('the tag list', () => {
  test('shows each tag with how many patches wear it', () => {
    renderPage()
    expect(screen.getByText('Bass')).toBeTruthy()
    expect(screen.getByText('7')).toBeTruthy()
    expect(screen.getByText('0')).toBeTruthy()
  })

  test('says what removing one does, since it is the surprising part', () => {
    renderPage()
    expect(screen.getByRole('alert').textContent).toContain('leaves every patch')
  })

  test('says so when there is nothing to offer', () => {
    renderPage([])
    expect(screen.getByText(/No tags/)).toBeTruthy()
  })
})

describe('adding one', () => {
  test('hands over what was typed and clears the field', () => {
    const { added } = renderPage()
    type('Drones')
    fireEvent.click(addButton())

    expect(added).toEqual(['Drones'])
    expect(field().value).toBe('')
  })

  test('is offered only once there is something to add', () => {
    renderPage()
    expect((addButton() as HTMLButtonElement).disabled).toBe(true)
    type('  ')
    expect((addButton() as HTMLButtonElement).disabled).toBe(true)
  })

  test('refuses one the list already has, before asking the server', () => {
    const { added } = renderPage()
    type('bass')

    expect(screen.getByText('That tag is already on the list.')).toBeTruthy()
    expect((addButton() as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(addButton())
    expect(added).toEqual([])
  })
})

describe('removing one', () => {
  test('names the tag in the button, so the row is not the only clue', () => {
    const { removed } = renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Bass' }))
    expect(removed).toEqual([TAGS[0]!])
  })
})
