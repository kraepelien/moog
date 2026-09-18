import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PreferencesPage } from '@components/PreferencesPage.tsx'
import type { NavPreference } from '@storage/deviceNav.ts'

afterEach(cleanup)

function renderPage(nav: NavPreference, placement: 'rail' | 'top' = 'rail') {
  const asked: NavPreference[] = []
  render(<PreferencesPage nav={nav} placement={placement} onNav={(next) => asked.push(next)} />)
  return asked
}

const option = (name: RegExp) => screen.getByRole('radio', { name })

describe('the menu setting', () => {
  test('shows what is chosen', () => {
    renderPage('top')
    expect((option(/Always across the top/) as HTMLInputElement).checked).toBe(true)
    expect((option(/Follow the window/) as HTMLInputElement).checked).toBe(false)
  })

  test('asks for the top when the top is picked', () => {
    const asked = renderPage('window')
    fireEvent.click(option(/Always across the top/))
    expect(asked).toEqual(['top'])
  })

  test('asks for the window back', () => {
    const asked = renderPage('top')
    fireEvent.click(option(/Follow the window/))
    expect(asked).toEqual(['window'])
  })

  /* Choosing the rail on a phone changes nothing on the screen, and a setting
     that appears not to work reads as a broken setting. */
  test('says when the window is too narrow for what was chosen', () => {
    renderPage('window', 'top')
    expect(screen.getByRole('alert').textContent).toContain('too narrow for the rail')
  })

  test('says nothing when the choice is what is on the screen', () => {
    renderPage('window', 'rail')
    expect(screen.queryByRole('alert')).toBeNull()

    cleanup()
    renderPage('top', 'top')
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
