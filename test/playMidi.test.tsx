import { afterEach, describe, expect, test } from 'bun:test'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  waitForElementToBeRemoved,
} from '@testing-library/react'
import { PlayMidi } from '../src/components/midi/PlayMidi.tsx'
import { forgetMidiSession } from '../src/components/midi/session.ts'
import type { LibraryEntry } from '../src/components/library/entry.ts'
import { createPatch } from '../src/patch/schema.ts'

/* The page is driven the way a person drives it, and then unmounted, because
   what is being tested is what survives the unmount: leaving the tab used to
   throw the file and every sound chosen for it away. */

afterEach(() => {
  cleanup()
  forgetMidiSession()
})

const TICKS = 96

const chunk = (name: string, body: number[]): number[] => [
  ...[...name].map((c) => c.charCodeAt(0)),
  (body.length >> 24) & 0xff,
  (body.length >> 16) & 0xff,
  (body.length >> 8) & 0xff,
  body.length & 0xff,
  ...body,
]

/* One channel, one note, at the specification's default tempo of 120. */
const ONE_NOTE = new Uint8Array([
  ...chunk('MThd', [0, 0, 0, 1, (TICKS >> 8) & 0xff, TICKS & 0xff]),
  ...chunk('MTrk', [0x00, 0x90, 60, 100, TICKS, 0x80, 60, 0, 0x00, 0xff, 0x2f, 0x00]),
])

const ENTRY: LibraryEntry = {
  id: 'sub-bass',
  name: 'Sub Bass',
  origin: 'factory',
  mine: false,
  ownerName: null,
  tags: [],
  instrument: 'minimoog-model-d',
  visibility: 'public',
  approximate: false,
  rating: null,
  averageRating: null,
  ratingCount: 0,
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function show() {
  const { container } = render(
    <PlayMidi
      entries={[ENTRY]}
      loadPatch={async () => createPatch({ name: 'Sub Bass' })}
    />,
  )
  return container
}

async function upload(container: HTMLElement, bytes: Uint8Array, name = 'song.mid') {
  const input = container.querySelector('input[type="file"]')!
  fireEvent.change(input, { target: { files: [new File([bytes as BlobPart], name)] } })
  await waitFor(() => expect(screen.getByText(name)).toBeDefined())
}

/* The picker is a modal, and while one is open MUI hides the page behind it from
   the accessibility tree — so nothing on the page is findable until it has
   finished closing. */
async function dress() {
  fireEvent.click(screen.getByRole('button', { name: 'Load patch' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Open Sub Bass in the editor' }))
  await waitForElementToBeRemoved(() => screen.queryByRole('dialog'))
  await waitFor(() => expect(screen.getByText('Sub Bass')).toBeDefined())
}

describe('the MIDI page', () => {
  test('reads a file into parts', async () => {
    const container = show()
    await upload(container, ONE_NOTE)
    expect(screen.getByText('Channel 1')).toBeDefined()
    expect(screen.getByText('1 notes')).toBeDefined()
  })

  test('keeps the file and its sounds when the page is left', async () => {
    const container = show()
    await upload(container, ONE_NOTE)
    await dress()

    cleanup()
    show()

    expect(screen.getByText('song.mid')).toBeDefined()
    expect(screen.getByText('Channel 1')).toBeDefined()
    expect(screen.getByText('Sub Bass')).toBeDefined()
  })

  test('keeps a corrected tempo when the page is left', async () => {
    const container = show()
    await upload(container, ONE_NOTE)
    fireEvent.change(screen.getByLabelText('Tempo in beats per minute'), {
      target: { value: '90' },
    })

    cleanup()
    show()

    expect((screen.getByLabelText('Tempo in beats per minute') as HTMLInputElement).value).toBe('90')
  })

  /* Play is what turns the choosing into sound, and a part with no sound is not
     something to play. */
  test('offers Play only once a part has a sound', async () => {
    const container = show()
    await upload(container, ONE_NOTE)
    expect((screen.getByRole('button', { name: 'Play' }) as HTMLButtonElement).disabled).toBe(true)
    await dress()
    expect((screen.getByRole('button', { name: 'Play' }) as HTMLButtonElement).disabled).toBe(false)
  })

  test('a fresh file clears the sounds chosen for the last one', async () => {
    const container = show()
    await upload(container, ONE_NOTE)
    await dress()
    await upload(container, ONE_NOTE, 'other.mid')
    expect(screen.queryByText('Sub Bass')).toBe(null)
    expect(screen.getByText('silent')).toBeDefined()
  })
})
