import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, render } from '@testing-library/react'
import { navigate } from '@navigation/router.ts'
import { ADMIN_ROUTES, HOME_ROUTE, ROUTES } from '@navigation/routes.ts'
import { APP_NAME, titleFor, useDocumentTitle } from '@navigation/title.ts'

afterEach(async () => {
  cleanup()
  await navigate('/')
})

function Page() {
  useDocumentTitle()
  return null
}

const route = (name: string) => ROUTES.find((entry) => entry.name === name)!

describe('naming a page', () => {
  test('puts the page in front of the app', () => {
    expect(titleFor(route('library'))).toBe(`Patch library · ${APP_NAME}`)
    expect(titleFor(route('midi'))).toBe(`Play MIDI · ${APP_NAME}`)
  })

  test('leaves the home page as the app alone', () => {
    expect(titleFor(HOME_ROUTE)).toBe(APP_NAME)
  })

  /* "Layout" and "People" name nothing in particular on their own. */
  test('says when a page is administrative', () => {
    expect(titleFor(route('users'))).toBe(`Admin: People · ${APP_NAME}`)
    expect(titleFor(route('admin'))).toBe(`Admin: Tags · ${APP_NAME}`)
    for (const entry of ADMIN_ROUTES) expect(titleFor(entry)).toContain('Admin: ')
  })

  test('ends every page on the app, so a bookmark says where it came from', () => {
    for (const entry of ROUTES) expect(titleFor(entry).endsWith(APP_NAME)).toBe(true)
  })
})

describe('the document title', () => {
  test('follows the address', async () => {
    render(<Page />)
    expect(document.title).toBe(APP_NAME)

    await act(async () => {
      await navigate('/midi')
    })
    expect(document.title).toBe(`Play MIDI · ${APP_NAME}`)

    await act(async () => {
      await navigate('/admin/layout')
    })
    expect(document.title).toBe(`Admin: Layout · ${APP_NAME}`)
  })
})

/* The name exists twice: in the document as it is served, and in what the first
   navigation writes over it. */
test('the served document is named after the app', async () => {
  const html = await Bun.file(new URL('../index.html', import.meta.url)).text()
  expect(html).toContain(`<title>${APP_NAME}</title>`)
})
