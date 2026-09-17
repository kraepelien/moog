import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ExportDialog } from '@admin/ExportDialog.tsx'

/* Handing the prompt over. The text is on the screen before Copy is pressed,
   which is what makes a clipboard the page is not allowed to write to an
   inconvenience rather than a dead end. */

afterEach(cleanup)

const PROMPT = 'Change the colours the moog app ships with.\n\n  - Card: #0e0e11 → #123456\n'

function renderDialog(open = true) {
  const closes: number[] = []
  render(<ExportDialog open={open} prompt={PROMPT} onClose={() => closes.push(1)} />)
  return closes
}

/* Restored by hand rather than through a helper: there is one of these. */
function withClipboard(writeText: (text: string) => Promise<void>) {
  const had = navigator.clipboard
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return () => Object.defineProperty(navigator, 'clipboard', { value: had, configurable: true })
}

describe('the dialog', () => {
  test('draws nothing until it is opened', () => {
    renderDialog(false)
    expect(screen.queryByLabelText('The prompt')).toBeNull()
  })

  test('shows the prompt where it can be selected and copied by hand', () => {
    renderDialog()
    expect(screen.getByLabelText('The prompt').textContent).toBe(PROMPT)
  })

  test('says the prompt has not been sent anywhere', () => {
    renderDialog()
    expect(screen.getByText(/Nothing here has been sent anywhere/)).toBeTruthy()
  })
})

describe('copying it', () => {
  test('puts the prompt on the clipboard', async () => {
    const copied: string[] = []
    const restore = withClipboard(async (text) => void copied.push(text))
    try {
      renderDialog()
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
      await waitFor(() => expect(copied).toEqual([PROMPT]))
    } finally {
      restore()
    }
  })

  /* The whole of the feedback, and it stays: this app has no notification
     surface, so an answer that faded would be one nobody was looking at. */
  test('answers in the button and leaves the answer there', async () => {
    const restore = withClipboard(async () => {})
    try {
      renderDialog()
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
      await waitFor(() => expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy())
      expect(document.querySelector('.MuiSnackbar-root')).toBeNull()
    } finally {
      restore()
    }
  })

  test('says so and leaves the text selectable when the browser refuses', async () => {
    const restore = withClipboard(() => Promise.reject(new Error('denied')))
    try {
      renderDialog()
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
      await waitFor(() => expect(screen.getByText(/did not let the page write/)).toBeTruthy())
      expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy()
      expect(screen.getByLabelText('The prompt').textContent).toBe(PROMPT)
    } finally {
      restore()
    }
  })
})
