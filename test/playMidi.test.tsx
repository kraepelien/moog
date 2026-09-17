import { afterEach, describe, expect, test } from 'bun:test'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  waitForElementToBeRemoved,
} from '@testing-library/react'
import { PlayMidi } from '@components/midi/PlayMidi.tsx'
import { audibleParts, forgetMidiSession, type MidiSession } from '@components/midi/session.ts'
import { readMidiFile } from '@audio/midiFile.ts'
import type { LibraryEntry } from '@components/library/entry.ts'
import type { Arrangement } from '@components/midi/arrangement.ts'
import type { Desk } from '@components/midi/desk.ts'
import { AccessProvider } from '@access/AccessProvider.tsx'
import { PRIVILEGE } from '@access/privileges.ts'
import { createPatch, type Patch } from '@patch/schema.ts'

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

interface FakeDesk extends Desk {
  readonly rows: Map<string, Arrangement>
  /* Patches the desk can still find. Deleting one is how a saved arrangement
     comes to point at a sound that is gone. */
  readonly patches: Map<string, Patch>
}

function fakeDesk(): FakeDesk {
  const rows = new Map<string, Arrangement>()
  const patches = new Map<string, Patch>([['sub-bass', createPatch({ name: 'Sub Bass' })]])
  let next = 1

  return {
    rows,
    patches,
    list: async () =>
      [...rows.values()].map(({ id, name, fileName, bpm, parts, updatedAt }) => ({
        id,
        name,
        fileName,
        bpm,
        parts: Object.keys(parts).length,
        updatedAt,
      })),
    get: async (id) => rows.get(id) ?? null,
    create: async (input) => {
      const made = { ...input, id: `a${next++}`, updatedAt: '2026-01-01T00:00:00.000Z' }
      rows.set(made.id, made)
      return made
    },
    save: async (id, input) => {
      const made = { ...input, id, updatedAt: '2026-01-02T00:00:00.000Z' }
      rows.set(id, made)
      return made
    },
    remove: async (id) => {
      rows.delete(id)
    },
    patch: async (id) => patches.get(id) ?? null,
  }
}

let desk: FakeDesk
let problems: string[]

function show(privileges: readonly string[] = [PRIVILEGE.StoreMidi]) {
  desk = fakeDesk()
  problems = []
  const { container } = render(
    <AccessProvider privileges={privileges}>
      <PlayMidi
        entries={[ENTRY]}
        loadPatch={async () => createPatch({ name: 'Sub Bass' })}
        desk={desk}
        onProblem={(message) => problems.push(message)}
      />
    </AccessProvider>,
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

/* Saving the desk and putting it back. The privilege decides whether the two
   buttons are drawn at all; the routes behind them refuse either way. */
describe('keeping an arrangement', () => {
  const saveAs = async (name: string) => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const field = await screen.findByLabelText('Name')
    fireEvent.change(field, { target: { value: name } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitForElementToBeRemoved(() => screen.queryByRole('dialog'))
  }

  const openSaved = async (name: string) => {
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    fireEvent.click(await screen.findByText(name))
    await waitForElementToBeRemoved(() => screen.queryByRole('dialog'))
  }

  test('offers nothing to somebody without the privilege', async () => {
    const container = show([])
    await upload(container, ONE_NOTE)

    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull()
  })

  test('offers both to somebody with it', async () => {
    const container = show()
    await upload(container, ONE_NOTE)

    expect(screen.getByRole('button', { name: 'Save' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Open' })).toBeDefined()
  })

  /* Open is always there because it is how a file gets onto an empty desk;
     Save waits for something to keep. */
  test('has nothing to save before a file is loaded', () => {
    show()
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Open' }).hasAttribute('disabled')).toBe(false)
  })

  test('keeps the file and the sound put on each part', async () => {
    const container = show()
    await upload(container, ONE_NOTE)
    await dress()
    await saveAs('Night Drive')

    const stored = [...desk.rows.values()][0]!
    expect(stored.name).toBe('Night Drive')
    expect(stored.fileName).toBe('song.mid')
    expect(stored.midi.length).toBeGreaterThan(0)
    expect(stored.parts).toEqual({ '1': { patchId: 'sub-bass', name: 'Sub Bass' } })
  })

  test('keeps which parts were soloed and muted', async () => {
    const container = show()
    await upload(container, TWO_PARTS)
    await dress()
    fireEvent.click(screen.getByRole('button', { name: 'Solo Channel 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mute Channel 2' }))
    await saveAs('Mix')

    const stored = [...desk.rows.values()][0]!
    expect(stored.soloed).toEqual([1])
    expect(stored.muted).toEqual([2])
  })

  /* Only the server mints an id, which is what stops every save becoming
     another copy of the same arrangement. */
  test('writes over the one that was saved rather than adding another', async () => {
    const container = show()
    await upload(container, ONE_NOTE)
    await dress()
    await saveAs('First')
    await saveAs('Renamed')

    expect(desk.rows.size).toBe(1)
    expect([...desk.rows.values()][0]!.name).toBe('Renamed')
  })

  test('a fresh upload is a new arrangement, not a rename of the last one', async () => {
    const container = show()
    await upload(container, ONE_NOTE)
    await dress()
    await saveAs('First')

    await upload(container, TWO_PARTS, 'other.mid')
    await saveAs('Second')

    expect(desk.rows.size).toBe(2)
  })

  test('puts the file, the tempo and the sounds back', async () => {
    const container = show()
    await upload(container, ONE_NOTE)
    await dress()
    fireEvent.change(screen.getByLabelText('Tempo in beats per minute'), {
      target: { value: '96' },
    })
    await saveAs('Night Drive')

    await upload(container, TWO_PARTS, 'other.mid')
    await openSaved('Night Drive')

    await waitFor(() => expect(screen.getByText('song.mid')).toBeDefined())
    /* Matched without case because a restored part is labelled from the patch,
       whose stored name is uppercase, while choosing one labels it from the
       library row. The same string in real data; this fixture's row is not. */
    expect(screen.getAllByText(/sub bass/i)[0]).toBeDefined()
    expect((screen.getByLabelText('Tempo in beats per minute') as HTMLInputElement).value).toBe(
      '96',
    )
  })

  /* A part points at a patch rather than carrying a copy, so a deleted patch is
     a silent part — said out loud, because a part that was dressed and now is
     not looks like the arrangement failed to load. */
  test('says which sounds have gone rather than loading them silently', async () => {
    const container = show()
    await upload(container, ONE_NOTE)
    await dress()
    await saveAs('Night Drive')

    desk.patches.delete('sub-bass')
    await openSaved('Night Drive')

    await waitFor(() => expect(screen.getByText('silent')).toBeDefined())
    expect(problems.join(' ')).toContain('Sub Bass')
  })

  test('drops one that is deleted from the list', async () => {
    const container = show()
    await upload(container, ONE_NOTE)
    await dress()
    await saveAs('Night Drive')

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Night Drive' }))

    await waitFor(() => expect(desk.rows.size).toBe(0))
    expect(await screen.findByText(/Nothing saved yet/)).toBeDefined()
  })
})
