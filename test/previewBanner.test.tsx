import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PreviewBanner } from '@components/PreviewBanner.tsx'
import { DEFAULT_SKIN, type Skin } from '@/tones.ts'

/* The one thing on screen that says the colours are not the app's. It is in the
   chrome rather than on the layout page because the preview follows you out of
   that page, and a repaint nothing accounts for is the failure this prevents. */

afterEach(cleanup)

function renderBanner(skin: Skin) {
  const resets: number[] = []
  render(<PreviewBanner skin={skin} onReset={() => resets.push(1)} />)
  return resets
}

describe('when there is nothing to say', () => {
  test('draws nothing at the colours the app ships with', () => {
    renderBanner({})
    expect(screen.queryByText(/Previewing colours/)).toBeNull()
  })

  /* A session entry edited by hand can name a colour and give it the default,
     and that is not a preview of anything. */
  test('draws nothing for a colour that equals the default', () => {
    renderBanner({ page: DEFAULT_SKIN.page! })
    expect(screen.queryByText(/Previewing colours/)).toBeNull()
  })
})

describe('once a colour has been changed', () => {
  test('says whose colours these are and how long they last', () => {
    renderBanner({ content: '#123456' })
    expect(screen.getByText(/Previewing colours/)).toBeTruthy()
    expect(screen.getByText(/close the tab/)).toBeTruthy()
  })

  test('offers the way out as well as the way on', () => {
    renderBanner({ content: '#123456' })
    expect(screen.getByRole('button', { name: 'Export…' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reset' })).toBeTruthy()
  })

  /* The skin is owned above, so the banner asks rather than clears: doing it
     here would leave the document painted and the fields still showing it. */
  test('reports the reset rather than doing it itself', () => {
    const resets = renderBanner({ content: '#123456' })
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(resets).toEqual([1])
  })

  test('opens the prompt, naming the colour that changed', () => {
    renderBanner({ content: '#123456' })
    fireEvent.click(screen.getByRole('button', { name: 'Export…' }))
    const prompt = screen.getByLabelText('The prompt').textContent ?? ''
    expect(prompt).toContain('--shell-content')
    expect(prompt).toContain(`${DEFAULT_SKIN.content!} → #123456`)
  })
})
