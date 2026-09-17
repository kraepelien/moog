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
import { audibleParts, forgetMidiSession, type MidiSession } from '../src/components/midi/session.ts'
import { readMidiFile } from '../src/audio/midiFile.ts'
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

/* Two channels in one track, which is how a file usually writes a duet. */
const TWO_PARTS = new Uint8Array([
  ...chunk('MThd', [0, 0, 0, 1, (TICKS >> 8) & 0xff, TICKS & 0xff]),
  ...chunk('MTrk', [
    0x00, 0x90, 60, 100,
    0x00, 0x91, 67, 100,
    TICKS, 0x80, 60, 0,
    0x00, 0x81, 67, 0,
    0x00, 0xff, 0x2f, 0x00,
  ]),
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
  fireEvent.click(screen.getAllByRole('button', { name: 'Load patch' })[0]!)
  fireEvent.click(await screen.findByRole('button', { name: 'Open Sub Bass in the editor' }))
  await waitForElementToBeRemoved(() => screen.queryByRole('dialog'))
  await waitFor(() => expect(screen.getAllByText('Sub Bass')[0]).toBeDefined())
}

const pressed = (label: string) =>
  screen.getByRole('button', { name: label }).getAttribute('aria-pressed')

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

describe('the solo and mute switches', () => {
  test('every part has them, solo first, and both start unpressed', async () => {
    const container = show()
    await upload(container, TWO_PARTS)

    const first = container.querySelectorAll('li')[0]!
    const labelled = [...first.querySelectorAll('button')]
      .map((button) => button.getAttribute('aria-label'))
      .filter((label) => label !== null)
    expect(labelled).toEqual(['Solo Channel 1', 'Mute Channel 1'])
    expect(pressed('Solo Channel 1')).toBe('false')
    expect(pressed('Mute Channel 1')).toBe('false')
  })

  test('both can be on at once', async () => {
    const container = show()
    await upload(container, TWO_PARTS)

    fireEvent.click(screen.getByRole('button', { name: 'Solo Channel 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mute Channel 1' }))

    expect(pressed('Solo Channel 1')).toBe('true')
    expect(pressed('Mute Channel 1')).toBe('true')
  })

  test('pressing one again lets it go', async () => {
    const container = show()
    await upload(container, TWO_PARTS)

    const solo = screen.getByRole('button', { name: 'Solo Channel 2' })
    fireEvent.click(solo)
    fireEvent.click(solo)
    expect(pressed('Solo Channel 2')).toBe('false')
  })

  test('they survive leaving the page, as the file does', async () => {
    const container = show()
    await upload(container, TWO_PARTS)
    fireEvent.click(screen.getByRole('button', { name: 'Mute Channel 2' }))

    cleanup()
    show()

    expect(pressed('Mute Channel 2')).toBe('true')
  })

  test('a fresh file starts with nothing pressed', async () => {
    const container = show()
    await upload(container, TWO_PARTS)
    fireEvent.click(screen.getByRole('button', { name: 'Mute Channel 2' }))
    await upload(container, TWO_PARTS, 'other.mid')

    expect(pressed('Mute Channel 2')).toBe('false')
  })
})

/* The rule the switches stand for, checked against the parts themselves rather
   than through the page: what a desk does with S and M is worth stating once. */
describe('what a file plays', () => {
  const FILE = readMidiFile(TWO_PARTS)
  const patch = createPatch({ name: 'Sub Bass' })
  const sound = (name: string) => ({ entryId: name, name, patch })

  const sessionWith = (over: Partial<MidiSession> = {}): MidiSession => ({
    file: FILE,
    fileName: 'song.mid',
    trouble: null,
    chosen: { 1: sound('Lead'), 2: sound('Bass') },
    bpm: '120',
    soloed: new Set(),
    muted: new Set(),
    playing: false,
    ...over,
  })

  const heard = (session: MidiSession) => audibleParts(session).map((part) => part.channel)

  test('with nothing pressed, every part with a sound is heard', () => {
    expect(heard(sessionWith())).toEqual([1, 2])
  })

  test('one solo quietens the parts that are not soloed', () => {
    expect(heard(sessionWith({ soloed: new Set([2]) }))).toEqual([2])
  })

  test('a second solo joins the first rather than replacing it', () => {
    expect(heard(sessionWith({ soloed: new Set([1, 2]) }))).toEqual([1, 2])
  })

  test('a mute takes a part out with nothing soloed', () => {
    expect(heard(sessionWith({ muted: new Set([1]) }))).toEqual([2])
  })

  /* The one rule that has to be stated: pressing both is not a contradiction to
     be resolved by whichever was pressed last. */
  test('mute wins over solo on the same part', () => {
    expect(heard(sessionWith({ soloed: new Set([1]), muted: new Set([1]) }))).toEqual([])
  })

  test('a muted part stays out while another part is soloed', () => {
    expect(heard(sessionWith({ soloed: new Set([1, 2]), muted: new Set([2]) }))).toEqual([1])
  })

  test('a part with no sound is never heard, whatever is pressed', () => {
    expect(heard(sessionWith({ chosen: {}, soloed: new Set([1]) }))).toEqual([])
  })
})
