import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AccessProvider } from '@access/AccessProvider.tsx'
import { PageNav } from '@components/PageNav.tsx'
import { PanelChecklist } from '@components/Panel.tsx'
import { PatchPage } from '@components/patch/PatchPage.tsx'
import type { LibraryEntry } from '@components/library/entry.ts'
import { panelRegistry } from '@controls/panel.ts'
import { ROUTES } from '@navigation/routes.ts'
import { createPatch, type Patch } from '@patch/schema.ts'

/* The sheet is the one page that shows a patch without being able to change it,
   so most of what is worth testing here is an absence: a knob that does not
   turn, a message that does not claim to know why a patch is missing. */

afterEach(cleanup)

const PATCH: Patch = createPatch({
  name: 'Midnight Funk',
  notes: 'Bring the mod wheel up under the second phrase.',
  tags: ['BASS', 'FUNK'],
  values: { osc2Frequency: 3, filterCutoff: 2.5 },
})

const ENTRY: LibraryEntry = {
  id: PATCH.id,
  name: PATCH.name,
  origin: 'factory',
  mine: false,
  ownerName: null,
  tags: PATCH.tags,
  instrument: PATCH.instrument,
  visibility: 'public',
  approximate: false,
  rating: 4,
  averageRating: 4.5,
  ratingCount: 12,
  updatedAt: PATCH.updatedAt,
}

function renderSheet(overrides: Partial<Parameters<typeof PatchPage>[0]> = {}) {
  const counts = { opened: 0, browsed: 0, printed: 0 }
  /* The page is controlled by whatever holds `played`, so what it does with a
     control it leaves live is report it, not redraw itself. */
  const playedBack: { id: string; value: unknown }[] = []
  render(
    <PatchPage
      patch={PATCH}
      loading={false}
      entry={ENTRY}
      onOpen={() => (counts.opened += 1)}
      onBrowse={() => (counts.browsed += 1)}
      onPlay={(id, value) => playedBack.push({ id, value })}
      onPrint={() => (counts.printed += 1)}
      {...overrides}
    />,
  )
  return {
    ...counts,
    playedBack,
    opened: () => counts.opened,
    browsed: () => counts.browsed,
    printed: () => counts.printed,
  }
}

describe('the patch sheet', () => {
  test('names the patch and offers the way into the editor', () => {
    renderSheet()
    expect(screen.getByText('Midnight Funk')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open in the editor' })).toBeTruthy()
  })

  test('draws the panel at the values the patch stores', () => {
    renderSheet()
    expect(screen.getByRole('slider', { name: 'Oscillator-2' }).getAttribute('aria-valuenow')).toBe(
      '3',
    )
  })

  test('says which categories and which synth, without offering to filter by them', () => {
    renderSheet()
    /* Locked chips: a fact about this patch, so they are not buttons. */
    expect(screen.getByText('BASS')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /BASS/ })).toBeNull()
  })

  test('shows the notes, which nothing else in the app ever draws', () => {
    renderSheet()
    expect(screen.getByText(/Bring the mod wheel up/)).toBeTruthy()
  })

  test('reports a press of the editor button once', () => {
    const sheet = renderSheet()
    fireEvent.click(screen.getByRole('button', { name: 'Open in the editor' }))
    expect(sheet.opened()).toBe(1)
  })
})

/* The whole point of the page: it shows a patch as it was saved, so a link
   somebody opens shows them what was sent rather than what they then nudged. */
describe('what the sheet will not let you move', () => {
  test('a knob the patch records does not turn under the keyboard', () => {
    renderSheet()
    const knob = screen.getByRole('slider', { name: 'Oscillator-2' })
    fireEvent.keyDown(knob, { key: 'ArrowUp' })
    expect(knob.getAttribute('aria-valuenow')).toBe('3')
  })

  test('and neither does a switch', () => {
    renderSheet()
    const before = screen.getByRole('switch', { name: 'Osc. 3 Control' }).getAttribute('aria-checked')
    fireEvent.click(screen.getByRole('switch', { name: 'Osc. 3 Control' }))
    expect(screen.getByRole('switch', { name: 'Osc. 3 Control' }).getAttribute('aria-checked')).toBe(
      before,
    )
  })

  /* The output levels describe the room rather than the sound and are not in
     the patch, so freezing them would be freezing something the sheet is not
     showing. The keyboard is a decoration and is never frozen either, which is
     what keeps a shared link playable. */
  test('leaves what the patch does not record alone', () => {
    const sheet = renderSheet()
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Phones Volume' }), { key: 'ArrowUp' })
    expect(sheet.playedBack.map((one) => one.id)).toEqual(['phonesVolume'])
  })

  /* The other half of the same rule: a frozen control reports nothing at all,
     rather than reporting a change that something upstream then has to ignore. */
  test('and says nothing when a recorded control is pressed', () => {
    const sheet = renderSheet()
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Oscillator-2' }), { key: 'ArrowUp' })
    expect(sheet.playedBack).toEqual([])
  })
})

describe('an address with no patch behind it', () => {
  test('says so without guessing which of the three reasons it is', () => {
    renderSheet({ patch: null, entry: null })
    expect(screen.getByText('No patch at this address')).toBeTruthy()
    expect(screen.queryByRole('slider')).toBeNull()
  })

  test('offers the library rather than leaving a dead end', () => {
    const sheet = renderSheet({ patch: null, entry: null })
    fireEvent.click(screen.getByRole('button', { name: 'Browse the library' }))
    expect(sheet.browsed()).toBe(1)
  })

  test('says nothing at all while it is still being fetched', () => {
    renderSheet({ patch: null, entry: null, loading: true })
    expect(screen.queryByText('No patch at this address')).toBeNull()
  })
})

/* Printing is the sheet on paper, which is what the page was drawn from in the
   first place. happy-dom renders no stylesheet, so what a print looks like is
   not testable here; what is, is that the button asks exactly once and that the
   parts of the app that are not the patch carry the attribute the print
   stylesheet hides them by. */
describe('printing the sheet', () => {
  test('offers it beside the way into the editor', () => {
    renderSheet()
    expect(screen.getByRole('button', { name: 'Print' })).toBeTruthy()
  })

  test('asks the browser once, through whatever it was handed', () => {
    const sheet = renderSheet()
    fireEvent.click(screen.getByRole('button', { name: 'Print' }))
    expect(sheet.printed()).toBe(1)
  })

  test('marks the bar’s buttons as no part of the sheet, and keeps the name', () => {
    renderSheet()
    const name = screen.getByText('Midnight Funk')
    expect(name.closest('[data-print="off"]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Print' }).closest('[data-print="off"]')).toBeTruthy()
  })

  /* The nav and the checklist are the two the print stylesheet reaches furthest
     for, and neither has any other reason to carry the attribute: a section
     added to either without one is a page of the app printed onto the sheet. */
  test('leaves the navigation off the paper', () => {
    const editor = ROUTES.find((route) => route.name === 'editor')!
    render(
      <AccessProvider privileges={[]}>
        <PageNav
          route={editor}
          onNavigate={() => {}}
          actions={[]}
          placement="rail"
          collapsed={false}
          onCollapse={() => {}}
        />
      </AccessProvider>,
    )
    expect(screen.getByRole('navigation').getAttribute('data-print')).toBe('off')
  })

  test('and the panel checklist, which is a working view rather than a patch', () => {
    const { container } = render(<PanelChecklist registry={panelRegistry} />)
    expect(container.firstElementChild!.getAttribute('data-print')).toBe('off')
  })
})
