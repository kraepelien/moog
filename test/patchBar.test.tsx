import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PatchBar } from '@components/PatchBar.tsx'
import { applySkin } from '@/skin.ts'
import { DEFAULT_SKIN } from '@/tones.ts'

/* What the editor has open: the patch's name, whether it has been written down,
   and everything that can be done to it.

   The colours are custom properties, and a stylesheet is not loaded here, so the
   defaults are painted on first: without them every colour computes to nothing
   and each of these passes against the other. */
beforeEach(() => applySkin(DEFAULT_SKIN, document.documentElement))
afterEach(() => {
  cleanup()
  applySkin({}, document.documentElement)
})

function renderBar(overrides: Partial<Parameters<typeof PatchBar>[0]> = {}) {
  render(<PatchBar title={{ text: 'Sub Bass', unsaved: false }} buttons={[]} {...overrides} />)
}

const nameColour = () => getComputedStyle(screen.getByRole('heading', { level: 2 })).color

/* Capitals are the stylesheet's, so what a person typed survives being drawn. */
test('prints the name as it was typed, and leaves the capitals to CSS', () => {
  renderBar({ title: { text: 'Sub Bass', unsaved: false } })
  expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Sub Bass')
})

test('names a draft nobody has titled', () => {
  renderBar({ title: { text: '', unsaved: true } })
  expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('(unnamed)')
})

/* Colour is the only feedback a save gives now that nothing pops up to say so,
   which is why it is a resting state rather than a flash. */
describe('whether the panel has been written down', () => {
  test('says unsaved in the warning colour', () => {
    renderBar({ title: { text: 'Sub Bass', unsaved: true } })
    expect(nameColour()).toBe(DEFAULT_SKIN.warning!)
  })

  test('says saved in the success colour', () => {
    renderBar({ title: { text: 'Sub Bass', unsaved: false } })
    expect(nameColour()).toBe(DEFAULT_SKIN.success!)
  })
})

describe('what can be done to the open patch', () => {
  test('is pressed from the row', () => {
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
})
