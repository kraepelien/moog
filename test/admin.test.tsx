import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AdminPage } from '@admin/AdminPage.tsx'
import type { TagInUse } from '@admin/tags.ts'
import { DEFAULT_SKIN, toneForTag, type Skin } from '@/tones.ts'

afterEach(cleanup)

const TAGS: readonly TagInUse[] = [
  { id: 1, name: 'Bass', colour: null, patches: 7 },
  { id: 2, name: 'Lead', colour: null, patches: 0 },
]

/* An empty skin, which is the app painting with what the stylesheets declare.
   `skinValue` answers out of `DEFAULT_SKIN` for every key it is not given, so
   these do not need a stylesheet loaded to know what colour a tag is wearing. */
function renderPage(tags: readonly TagInUse[] = TAGS, skin: Skin = {}) {
  const added: string[] = []
  const removed: TagInUse[] = []
  const coloured: [string, string | null][] = []
  render(
    <AdminPage
      tags={tags}
      skin={skin}
      onAdd={(name) => added.push(name)}
      onColour={(tag, colour) => coloured.push([tag.name, colour])}
      onRemove={(tag) => removed.push(tag)}
    />,
  )
  return { added, removed, coloured }
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

/* The chip beside the picker is the same component the library draws a tag
   with, so the two disagreeing is the page having lost track of which colour a
   tag is actually wearing. */
describe('the colour of a tag', () => {
  /* The picker and the box beside it are both labelled for the tag, and it is
     the picker's own value this is about. */
  const swatch = (tag: string) =>
    screen.getByLabelText(`${tag} colour`, {
      selector: 'input[type="color"]',
    }) as HTMLInputElement
  const clear = (index: number) =>
    screen.getAllByRole('button', { name: 'Clear' })[index] as HTMLButtonElement

  test('opens on the colour the name hashes to, where nobody has chosen one', () => {
    renderPage()
    expect(swatch('Bass').value).toBe(DEFAULT_SKIN[toneForTag('Bass')]!)
    expect(swatch('Lead').value).toBe(DEFAULT_SKIN[toneForTag('Lead')]!)
  })

  /* Which is what stops the field going stale the day somebody repaints a tone
     on the Layout page: the hash names a tone, not a hex. */
  test('follows the skin the app is painted in', () => {
    renderPage(TAGS, { [toneForTag('Bass')]: '#123456' })
    expect(swatch('Bass').value).toBe('#123456')
  })

  test('opens on the one that was chosen, where one was', () => {
    renderPage([{ id: 1, name: 'Bass', colour: '#0e0eb9', patches: 7 }])
    expect(swatch('Bass').value).toBe('#0e0eb9')
  })

  /* The swatch shows the same colour either way, so Clear is the only thing
     saying whether it was chosen or worked out. */
  test('offers Clear only for one that was chosen', () => {
    renderPage([
      { id: 1, name: 'Bass', colour: '#0e0eb9', patches: 7 },
      { id: 2, name: 'Lead', colour: null, patches: 0 },
    ])
    expect(clear(0).disabled).toBe(false)
    expect(clear(1).disabled).toBe(true)
  })

  test('puts a tag back on the hash', () => {
    const { coloured } = renderPage([{ id: 1, name: 'Bass', colour: '#0e0eb9', patches: 7 }])
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(coloured).toEqual([['Bass', null]])
  })
})
