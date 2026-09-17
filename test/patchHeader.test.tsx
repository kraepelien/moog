import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import { PatchHeader } from '@components/library/PatchHeader.tsx'
import { applySkin } from '@/skin.ts'
import { DEFAULT_SKIN } from '@/tones.ts'

/* The bar above the panel. Its stars are exercised in rating.test.tsx; what is
   here is what the bar says without being asked — whether the panel has been
   written down, and what the patch is filed under.

   The colours are custom properties, and a stylesheet is not loaded here, so
   the defaults are painted on first: without them every colour computes to
   nothing and each of these passes against the other. */
beforeEach(() => applySkin(DEFAULT_SKIN, document.documentElement))
afterEach(() => {
  cleanup()
  applySkin({}, document.documentElement)
})

function renderHeader(overrides: Partial<Parameters<typeof PatchHeader>[0]> = {}) {
  render(
    <PatchHeader
      name="Sub Bass"
      tags={['Bass']}
      instrument="minimoog-model-d"
      bank={null}
      rating={null}
      average={null}
      ratingCount={0}
      actions={[]}
      {...overrides}
    />,
  )
}

const nameColour = () => getComputedStyle(screen.getByRole('heading')).color

/* Capitals are the stylesheet's, so what a person typed survives being drawn. */
test('prints the name as it was typed, and leaves the capitals to CSS', () => {
  renderHeader({ name: 'Sub Bass' })
  expect(screen.getByRole('heading', { name: 'Sub Bass' }).textContent).toBe('Sub Bass')
})

/* Colour is the only feedback a save gives now that nothing pops up to say so,
   which is why it is a resting state rather than a flash. */
describe('whether the panel has been written down', () => {
  test('says unsaved in amber', () => {
    renderHeader({ unsaved: true })
    expect(nameColour()).toBe(DEFAULT_SKIN.amber!)
  })

  test('says saved in green', () => {
    renderHeader({ unsaved: false })
    expect(nameColour()).toBe(DEFAULT_SKIN.green!)
  })

  /* A row in a list is neither: only the editor holds a draft. */
  test('says neither where nothing is being edited', () => {
    renderHeader()
    expect([DEFAULT_SKIN.amber, DEFAULT_SKIN.green]).not.toContain(nameColour())
  })
})

test('files the patch under its synth first and its categories after', () => {
  /* A name that shares no letters with either chip, so an index really is the
     chip's and not the heading's. */
  renderHeader({ name: 'Growler', tags: ['Bass', 'Drone'] })
  /* Read off what was rendered rather than off the props: the whole of the
     change is where the chips sit relative to each other. */
  const text = screen.getByRole('heading').parentElement!.textContent ?? ''
  expect(text.indexOf('Minimoog')).toBeLessThan(text.indexOf('Bass'))
  expect(text.indexOf('Bass')).toBeLessThan(text.indexOf('Drone'))
})
