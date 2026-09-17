import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { useConfirm } from '@components/useConfirm.tsx'
import { navigate, setBlocker, useNavigationBlock } from '@navigation/router.ts'

/* Leaving the editor with unsaved changes used to discard them without asking:
   `beforeunload` covers closing the tab and reloading, and a move between pages
   is neither. This is the wiring that closes that — the app's own dialog rather
   than the browser's, which is also the only one whose wording we choose.

   Every case answers the question and then waits on the navigation itself.
   The dialog stays mounted through its closing transition, so its absence is
   not what settles this; where the address ended up is. */

const quiet = createTheme({ components: { MuiButtonBase: { defaultProps: { disableRipple: true } } } })

afterEach(async () => {
  cleanup()
  setBlocker(null)
  await navigate('/')
})

const at = () => window.location.pathname

function Editor({ dirty }: { dirty: boolean }) {
  const { ask, dialog } = useConfirm()
  useNavigationBlock(dirty, () =>
    ask({
      title: 'Leave the editor?',
      body: 'The panel has changes that have not been saved. They are lost.',
      confirm: 'Discard and leave',
      destructive: true,
    }),
  )
  return <ThemeProvider theme={quiet}>{dialog}</ThemeProvider>
}

/* Started inside `act` because asking opens the dialog, and that is a state
   update React wants to know it caused. The promise is handed back rather than
   awaited: it does not settle until the question has been answered. */
function leave(to: string): Promise<void> {
  let going!: Promise<void>
  act(() => {
    going = navigate(to)
  })
  return going
}

const answer = (button: string) =>
  fireEvent.click(screen.getByRole('button', { name: button }))

describe('leaving a page with unsaved changes', () => {
  test('asks, in the app’s own dialog rather than the browser’s', async () => {
    render(<Editor dirty />)
    const going = leave('/library')

    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.getByText('Leave the editor?')).toBeTruthy()
    expect(screen.getByText(/have not been saved/)).toBeTruthy()

    answer('Cancel')
    await going
  })

  test('stays put while the question is open', async () => {
    render(<Editor dirty />)
    const going = leave('/library')

    await screen.findByRole('dialog')
    expect(at()).toBe('/')

    answer('Cancel')
    await going
  })

  test('goes once the changes are given up', async () => {
    render(<Editor dirty />)
    const going = leave('/library')

    await screen.findByRole('dialog')
    answer('Discard and leave')
    await going

    expect(at()).toBe('/library')
  })

  /* The reason the dialog exists: declining has to really mean no. */
  test('stays where it was when the question is declined', async () => {
    render(<Editor dirty />)
    const going = leave('/library')

    await screen.findByRole('dialog')
    answer('Cancel')
    await going

    expect(at()).toBe('/')
  })

  test('does not ask at all with nothing unsaved', async () => {
    render(<Editor dirty={false} />)

    await navigate('/library')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(at()).toBe('/library')
  })

  /* Saving clears the flag, and the guard has to go with it rather than asking
     about changes that are no longer there. */
  test('stops asking once the changes are saved', async () => {
    const { rerender } = render(<Editor dirty />)
    rerender(<Editor dirty={false} />)

    await navigate('/library')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(at()).toBe('/library')
  })
})
