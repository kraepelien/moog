import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TopBar } from '@components/TopBar.tsx'
import { ROUTES } from '@navigation/routes.ts'
import { applySkin } from '@/skin.ts'
import { DEFAULT_SKIN } from '@/tones.ts'

/* The bar carries the whole of the editor's chrome: what the patch is called,
   whether it has been written down, and everything that can be done to it.

   The colours are custom properties, and a stylesheet is not loaded here, so the
   defaults are painted on first: without them every colour computes to nothing
   and each of these passes against the other. */
beforeEach(() => applySkin(DEFAULT_SKIN, document.documentElement))
afterEach(() => {
  cleanup()
  applySkin({}, document.documentElement)
})

const editor = ROUTES.find((route) => route.name === 'editor')!

function renderBar(overrides: Partial<Parameters<typeof TopBar>[0]> = {}) {
  render(
    <TopBar
      route={editor}
      onNavigate={() => {}}
      actions={[]}
      title={{ text: 'Sub Bass', unsaved: false }}
      {...overrides}
    />,
  )
}

const nameColour = () => getComputedStyle(screen.getByRole('heading', { level: 2 })).color

/* Capitals are the stylesheet's, so what a person typed survives being drawn. */
test('prints the name as it was typed, and leaves the capitals to CSS', () => {
  renderBar({ title: { text: 'Sub Bass', unsaved: false } })
  expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Sub Bass')
})

/* Colour is the only feedback a save gives now that nothing pops up to say so,
   which is why it is a resting state rather than a flash. */
describe('whether the panel has been written down', () => {
  test('says unsaved in amber', () => {
    renderBar({ title: { text: 'Sub Bass', unsaved: true } })
    expect(nameColour()).toBe(DEFAULT_SKIN.amber!)
  })

  test('says saved in green', () => {
    renderBar({ title: { text: 'Sub Bass', unsaved: false } })
    expect(nameColour()).toBe(DEFAULT_SKIN.green!)
  })
})

describe('what can be done to the open patch', () => {
  test('is pressed from the bar', () => {
    const pressed: string[] = []
    renderBar({
      buttons: [
        { label: 'Save', tone: 'green', onSelect: () => pressed.push('Save') },
        { label: 'Delete', tone: 'pink', disabled: true, onSelect: () => pressed.push('Delete') },
      ],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(pressed).toEqual(['Save'])
  })

  /* A page with nothing open says nothing: the name and the buttons belong to
     the draft, not to the bar. */
  test('is absent where no page has anything open', () => {
    renderBar({ title: undefined })
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  })
})

/* The strip is glyphs so the bar has room for the rest of this, which leaves a
   reader with nothing to go on unless each one is named. */
describe('the tabs', () => {
  test('print the page you are on and draw the rest as glyphs', () => {
    renderBar()
    expect(screen.getByRole('tab', { name: 'Patch editor' }).textContent).toBe('Patch editor')
    expect(screen.getByRole('tab', { name: 'Patch library' }).textContent).toBe('')
  })

  test('go to the page they name', () => {
    const went: string[] = []
    renderBar({ onNavigate: (path) => went.push(path) })

    fireEvent.click(screen.getByRole('tab', { name: 'Play MIDI' }))
    expect(went).toEqual(['/midi'])
  })
})
