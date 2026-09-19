import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { bankPrompt, correctionOf, isEmpty } from '@patch/bankPrompt.ts'
import { createPatch, type Patch } from '@patch/schema.ts'

/* Correcting a factory patch writes the row, which is the live bank. The repo's
   file is what seeds a database that does not hold the slug yet, and nothing may
   push a file over an existing row, so bringing the two in line is a prompt
   somebody pastes rather than anything this app writes. */

const ROOT = join(import.meta.dir, '..')

const sheet = (over: Partial<Patch> = {}): Patch => ({
  ...createPatch({
    name: 'Midnight Funk',
    notes: 'Bring the mod wheel up.',
    values: { osc1Range: 'ft16', osc1Waveform: 'sawtooth', filterCutoff: 3 },
  }),
  id: 'midnight-funk',
  ...over,
})

describe('what a correction is', () => {
  test('is nothing at all when nothing moved', () => {
    const before = sheet()
    expect(isEmpty(correctionOf(before, before))).toBe(true)
  })

  test('names the controls that moved and leaves the rest out', () => {
    const before = sheet()
    const after = sheet({ values: { ...before.values, osc1Range: 'ft2' } })

    const correction = correctionOf(before, after)
    expect(correction.values).toEqual([{ control: 'osc1Range', from: 'ft16', to: 'ft2' }])
    expect(correction.slug).toBe('midnight-funk')
  })

  test('carries a corrected name and notes', () => {
    const before = sheet()
    const after = sheet({ name: 'Midnight Funk II', notes: 'Bring it up sooner.' })

    const correction = correctionOf(before, after)
    expect(correction.name).toEqual({ from: 'Midnight Funk', to: 'Midnight Funk II' })
    expect(correction.notes?.to).toBe('Bring it up sooner.')
  })
})

describe('the prompt it writes', () => {
  test('names the file the repo keeps that slug in', () => {
    const before = sheet()
    const after = sheet({ values: { ...before.values, osc1Range: 'ft2' } })

    const prompt = bankPrompt(correctionOf(before, after))
    expect(prompt).toContain('bank/midnight-funk.json')
    expect(prompt).toContain('"osc1Range"')
    expect(prompt).toContain('"ft2"')
    /* The old value too: whoever reads the file needs to recognise what they
       are replacing, not just what to write. */
    expect(prompt).toContain('"ft16"')
  })

  /* The file that prompt names has to exist, or the paste lands nowhere. The
     same check `exportPrompt.test.ts` makes against the files it names. */
  test('names a file that is actually in the repo', () => {
    const before = sheet()
    const after = sheet({ name: 'Midnight Funk II' })
    const prompt = bankPrompt(correctionOf(before, after))

    const named = prompt.match(/bank\/[a-z0-9-]+\.json/)![0]
    expect(existsSync(join(ROOT, named))).toBe(true)
  })

  /* An omission in a bank file means the registry default on purpose, so a
     correction that clears a control asks for a removal rather than for a
     default written in. */
  test('asks for a removal when a control goes back to Init', () => {
    const before = sheet()
    const after = sheet({ values: { osc1Waveform: 'sawtooth', filterCutoff: 3 } })

    const prompt = bankPrompt(correctionOf(before, after))
    expect(prompt).toContain('remove "osc1Range"')
    expect(prompt).toContain('registry default')
  })

  test('says why the row and the file disagree, and to change nothing else', () => {
    const before = sheet()
    const after = sheet({ values: { ...before.values, filterCutoff: 4 } })

    const prompt = bankPrompt(correctionOf(before, after))
    expect(prompt).toContain('live bank')
    expect(prompt).toContain('Change nothing else')
    /* The rule the whole design rests on: no flag, route or variable that puts
       a file back over a row. */
    expect(prompt).toContain('over a row that already exists')
  })
})
