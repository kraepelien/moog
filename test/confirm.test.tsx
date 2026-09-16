import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { useConfirm } from '../src/components/useConfirm.tsx'

/* The ripple animates state after the click has been asserted on, which React
   reports as an update outside act(). It is decoration, so it is off here
   rather than wrapped in waits. */
const quiet = createTheme({ components: { MuiButtonBase: { defaultProps: { disableRipple: true } } } })

/* This replaced `window.confirm`, which every delete and overwrite goes through,
   so what matters is that declining really answers no — a dialog that resolved
   true on dismissal would turn a cancelled delete into a delete. */

afterEach(cleanup)

function Harness({ answers }: { answers: boolean[] }) {
  const { ask, dialog } = useConfirm()
  return (
    <>
      <button
        onClick={() =>
          void ask({
            title: 'Delete “Air Bass”?',
            body: 'This removes one file.',
            confirm: 'Delete',
            destructive: true,
          }).then((agreed) => answers.push(agreed))
        }
      >
        Ask
      </button>
      {dialog}
    </>
  )
}

function openDialog() {
  const answers: boolean[] = []
  render(
    <ThemeProvider theme={quiet}>
      <Harness answers={answers} />
    </ThemeProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }))
  return answers
}

describe('asking before something irreversible', () => {
  test('shows the question and what the button will do', () => {
    openDialog()
    expect(screen.getByText('Delete “Air Bass”?')).toBeTruthy()
    expect(screen.getByText('This removes one file.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy()
  })

  test('agreeing answers yes', async () => {
    const answers = openDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(answers).toEqual([true]))
  })

  test('cancelling answers no', async () => {
    const answers = openDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(answers).toEqual([false]))
  })

  test('pressing Escape answers no', async () => {
    const answers = openDialog()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    await waitFor(() => expect(answers).toEqual([false]))
  })

  test('nothing is asked until it is', () => {
    render(
      <ThemeProvider theme={quiet}>
        <Harness answers={[]} />
      </ThemeProvider>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
