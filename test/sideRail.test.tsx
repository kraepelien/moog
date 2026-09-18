import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AccessProvider } from '@access/AccessProvider.tsx'
import { PRIVILEGE } from '@access/privileges.ts'
import { SideRail } from '@components/SideRail.tsx'
import { ROUTES } from '@navigation/routes.ts'

/* The rail is the only way to any page now that the tab strip is gone, so what
   it draws and what it refuses to draw is the whole of what is reachable. */

afterEach(cleanup)

const editor = ROUTES.find((route) => route.name === 'editor')!

function renderRail(
  overrides: Partial<Parameters<typeof SideRail>[0]> = {},
  privileges: readonly string[] = [],
) {
  render(
    <AccessProvider privileges={privileges}>
      <SideRail
        route={editor}
        onNavigate={() => {}}
        actions={[]}
        collapsed={false}
        onCollapse={() => {}}
        {...overrides}
      />
    </AccessProvider>,
  )
}

const current = (name: string) =>
  screen.getByRole('button', { name }).getAttribute('aria-current')

describe('the pages', () => {
  test('are a row each, in the order the table reads', () => {
    renderRail()
    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(
      [
        'Hide the page names',
        'Home',
        'Patch library',
        'Patch editor',
        'Play MIDI',
        'Account and file actions',
      ],
    )
  })

  /* Home is the mark rather than a row: a logo is where everybody presses to get
     back to the start, and spending a row on it as well would be two of them. */
  test('do not include home, which the mark carries', () => {
    renderRail()
    expect(screen.queryByText('Home')).toBeNull()
    const mark = screen.getByRole('heading', { level: 1 })
    expect(mark.contains(screen.getByRole('button', { name: 'Home' }))).toBe(true)
  })

  test('are reached from the mark, for home', () => {
    const went: string[] = []
    renderRail({ onNavigate: (path) => went.push(path) })

    fireEvent.click(screen.getByRole('button', { name: 'Home' }))
    expect(went).toEqual(['/'])
  })

  test('go to the page they name', () => {
    const went: string[] = []
    renderRail({ onNavigate: (path) => went.push(path) })

    fireEvent.click(screen.getByRole('button', { name: 'Play MIDI' }))
    expect(went).toEqual(['/midi'])
  })

  /* The row is a glyph and a word, neither of which says which one you are
     standing on; nothing else in the rail does either. */
  test('mark the one you are on', () => {
    renderRail()
    expect(current('Patch editor')).toBe('page')
    expect(current('Patch library')).toBeNull()
  })
})

/* A row to a page that refuses is a door most people find locked, and the
   administration pages are behind privileges that are held independently. */
describe('settings', () => {
  test('is absent for somebody who administers nothing', () => {
    renderRail()
    expect(screen.queryByRole('button', { name: 'Administration' })).toBeNull()
  })

  test('lands on the first administration page this account can open', () => {
    const went: string[] = []
    renderRail({ onNavigate: (path) => went.push(path) }, [PRIVILEGE.AdminUsers])

    fireEvent.click(screen.getByRole('button', { name: 'Administration' }))
    expect(went).toEqual(['/admin/users'])
  })

  test('is marked while any administration page is open', () => {
    const users = ROUTES.find((route) => route.name === 'users')!
    renderRail({ route: users }, [PRIVILEGE.AdminUsers])
    expect(current('Administration')).toBe('page')
  })
})

describe('folding the rail', () => {
  /* The stylesheet is what takes the words away, and it is not loaded here, so
     what is asserted is the flag it keys off rather than the words themselves.
     Each row is named whatever that flag says, which is the part a reader
     depends on: the word is what they would otherwise have gone by. */
  test('says so on the rail, and leaves every row named', () => {
    renderRail({ collapsed: true })
    expect(screen.getByRole('navigation').getAttribute('data-collapsed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Play MIDI' })).toBeTruthy()
  })

  test('says so when it is not folded', () => {
    renderRail({ collapsed: false })
    expect(screen.getByRole('navigation').getAttribute('data-collapsed')).toBe('false')
  })

  /* The name is a word like any other, and at 60px the lockup would be a
     wordmark eight pixels tall. Both drawings are named PATCHDB, so the heading
     reads the same whichever is up. */
  test('takes the name off the mark too, and keeps the heading', () => {
    const mark = () => screen.getByRole('img', { name: 'PATCHDB' }) as HTMLImageElement

    renderRail({ collapsed: false })
    expect(mark().getAttribute('src')).toBe('/patchdb.svg')

    cleanup()
    renderRail({ collapsed: true })
    expect(mark().getAttribute('src')).toBe('/logo.svg')
  })

  test('is what the arrow does', () => {
    const asked: boolean[] = []
    renderRail({ collapsed: false, onCollapse: (next) => asked.push(next) })

    fireEvent.click(screen.getByRole('button', { name: 'Hide the page names' }))
    expect(asked).toEqual([true])
  })

  test('is undone by the same arrow', () => {
    const asked: boolean[] = []
    renderRail({ collapsed: true, onCollapse: (next) => asked.push(next) })

    fireEvent.click(screen.getByRole('button', { name: 'Show the page names' }))
    expect(asked).toEqual([false])
  })
})

describe('the account menu', () => {
  test('opens from the last row', () => {
    const pressed: string[] = []
    renderRail({
      actions: [
        { label: 'Import a file…', onSelect: () => pressed.push('import') },
        { label: 'Sign out', separated: true, onSelect: () => pressed.push('out') },
      ],
    })

    expect(screen.queryByRole('menuitem', { name: 'Sign out' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Account and file actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(pressed).toEqual(['out'])
  })
})
