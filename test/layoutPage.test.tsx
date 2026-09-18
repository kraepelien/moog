import { afterEach, describe, expect, test } from 'bun:test'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LayoutPage } from '@admin/LayoutPage.tsx'
import { DEFAULT_SKIN, type Skin } from '@/tones.ts'

/* Picking the colours. What the page can no longer do is half of this: there is
   no Save, because there is nowhere for one to save to. */

afterEach(cleanup)

function renderPage({ keeping = true, start = {} as Skin } = {}) {
  const reported: Skin[] = []
  function Held() {
    const [skin, setSkin] = useState<Skin>(start)
    return (
      <LayoutPage
        skin={skin}
        keeping={keeping}
        onSkin={(next) => {
          reported.push(next)
          setSkin(next)
        }}
      />
    )
  }
  render(<Held />)
  return reported
}

const hexBox = (label: string) => screen.getByLabelText(`${label} as a hex code`)
const typeHex = (label: string, hex: string) =>
  fireEvent.change(hexBox(label), { target: { value: hex } })
const button = (name: string) => screen.getByRole('button', { name })
/* One section is drawn at a time, so a field has to be opened before it is
   there to type into. */
const openSection = (name: string) => fireEvent.click(screen.getByRole('tab', { name }))

describe('choosing a colour', () => {
  test('reports it under the key that draws it', () => {
    const reported = renderPage()
    openSection('Content')
    typeHex('Content', '#123456')
    expect(reported).toEqual([{ contentBg: '#123456' }])
  })

  /* Typing the stylesheet's own colour back in is how a field is undone, and it
     has to leave nothing behind or the export would offer `#x → #x`. */
  test('drops the key again when the colour goes back to the default', () => {
    const reported = renderPage({ start: { contentBg: '#123456' } })
    openSection('Content')
    typeHex('Content', DEFAULT_SKIN.contentBg!)
    expect(reported).toEqual([{}])
  })

  test('starts each field at what the app is actually drawing with', () => {
    renderPage({ start: { contentBg: '#123456' } })
    expect((hexBox('Background') as HTMLInputElement).value).toBe(DEFAULT_SKIN.background!)
    openSection('Content')
    expect((hexBox('Content') as HTMLInputElement).value).toBe('#123456')
  })
})

/* The picker is six digits and has no alpha channel, so a colour is taken apart
   on the way in and put back together on the way out. These are that seam. */
describe('a colour with something showing through it', () => {
  /* A row the card shows straight through, which is the one default that has to
     survive the trip through a picker with no alpha channel to show it in. */
  test('shows the eight-digit default in the box', () => {
    renderPage()
    openSection('Content')
    expect((hexBox('Row') as HTMLInputElement).value).toBe(DEFAULT_SKIN.contentRow1!)
    expect(DEFAULT_SKIN.contentRow1!).toHaveLength(9)
  })

  test('keeps the opacity when the picker moves the colour', () => {
    const reported = renderPage({ start: { menuActiveBg: '#11223380' } })
    openSection('Menu')
    fireEvent.change(screen.getByLabelText('Menu background color on active page as a swatch'), {
      target: { value: '#FF0000' },
    })
    expect(reported).toEqual([{ menuActiveBg: '#ff000080' }])
  })

  /* Six digits once nothing shows through, because a trailing `ff` is a
     difference against the stylesheet that the export would offer to make. */
  test('drops the alpha byte at full opacity', () => {
    const reported = renderPage({ start: { menuActiveBg: '#11223380' } })
    openSection('Menu')
    typeHex('Menu background color on active page', '#112233FF')
    expect(reported).toEqual([{ menuActiveBg: '#112233' }])
  })

  /* The short spellings are the same colour, and only the long one compares
     equal to the default, which is what undoing a field depends on. */
  test('widens a short hex so undoing a field still works', () => {
    const reported = renderPage({ start: { background: '#123456' } })
    typeHex('Background', '#000')
    expect(reported).toEqual([{}])
  })
})

describe('what it says it is doing', () => {
  /* The regression this page exists to be rid of: it used to save the colours
     against the installation and repaint the app for every visitor. */
  test('does not claim anybody else will see this', () => {
    renderPage()
    const said = screen
      .getAllByRole('alert')
      .map((alert) => alert.textContent ?? '')
      .join(' ')
    expect(said).not.toContain('everyone')
    expect(said).toContain('this browser')
    expect(said).toContain('nobody else')
  })

  test('has no Save, because there is nothing to save to', () => {
    renderPage({ start: { contentBg: '#123456' } })
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Revert' })).toBeNull()
  })

  test('warns when the browser will not keep the preview', () => {
    renderPage({ keeping: false })
    const said = screen.getAllByRole('alert').map((alert) => alert.textContent ?? '')
    expect(said.some((line) => line.includes('not keeping'))).toBe(true)
  })

  test('says nothing about that when it is being kept', () => {
    renderPage()
    const said = screen.getAllByRole('alert').map((alert) => alert.textContent ?? '')
    expect(said.some((line) => line.includes('not keeping'))).toBe(false)
  })
})

describe('going back to the colours the app ships with', () => {
  test('is offered only when something has been changed', () => {
    renderPage()
    expect((button('Defaults') as HTMLButtonElement).disabled).toBe(true)
  })

  test('clears every choice at once', () => {
    const reported = renderPage({ start: { contentBg: '#123456', blue: '#2266ff' } })
    fireEvent.click(button('Defaults'))
    expect(reported).toEqual([{}])
  })
})
