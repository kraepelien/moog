import { describe, expect, test } from 'bun:test'
import { panelRegistry } from '../src/controls/panel.ts'
import { isRecalled } from '../src/controls/recall.ts'
import { mergeValues, resolvePatch } from '../src/patch/resolve.ts'
import { createPatch } from '../src/patch/schema.ts'
import { fixedIdentity } from './fixtures.ts'

/* The pitch wheel is on the panel and it moves, but the instrument cannot hold
   it anywhere: let go and it springs back to centre. So it is played rather than
   set, and a patch carries nothing for it. */

describe('a control that springs back', () => {
  test('is the pitch wheel, and nothing else on the panel', () => {
    const played = panelRegistry.controls.filter((def) => !isRecalled(def)).map((def) => def.id)
    expect(played).toEqual(['pitchWheel'])
  })

  test('is still a control, so its id stays protected', () => {
    expect(panelRegistry.control('pitchWheel')).toBeDefined()
  })

  test('sits at rest on load however the file found it', () => {
    const patch = createPatch({ name: 'Bent', values: { pitchWheel: -4 } }, fixedIdentity())
    const { values, report } = resolvePatch(panelRegistry, patch)
    expect(values.pitchWheel).toBe(0)
    /* Ignored, not repaired: it is neither a bad value nor an absent one. */
    expect(report.invalid).toEqual([])
    expect(report.coerced).toEqual([])
    expect(report.missing).not.toContain('pitchWheel')
  })

  test('is dropped from a patch that an older build wrote it into', () => {
    const patch = createPatch({ name: 'Bent', values: { pitchWheel: -4 } }, fixedIdentity())
    const saved = mergeValues(panelRegistry, patch, { modWheel: 5 })
    expect(saved).not.toHaveProperty('pitchWheel')
    expect(saved.modWheel).toBe(5)
  })

  test('cannot be written into one by editing it either', () => {
    const patch = createPatch({ name: 'Fresh' }, fixedIdentity())
    expect(mergeValues(panelRegistry, patch, { pitchWheel: 3.5 })).toEqual({})
  })

  test('does not take an unknown id down with it', () => {
    /* Unknown ids are kept on purpose, so the drop has to be aimed at controls
       this build knows are not recalled, not at everything it cannot place. */
    const patch = createPatch(
      { name: 'Mixed', values: { pitchWheel: -4, fromTheFuture: 'keep' } },
      fixedIdentity(),
    )
    expect(mergeValues(panelRegistry, patch, {})).toEqual({ fromTheFuture: 'keep' })
  })
})

describe('the mod wheel is not sprung', () => {
  test('so a patch does hold where it was left', () => {
    const patch = createPatch({ name: 'Held', values: { modWheel: 6.5 } }, fixedIdentity())
    expect(resolvePatch(panelRegistry, patch).values.modWheel).toBe(6.5)
    expect(mergeValues(panelRegistry, patch, {}).modWheel).toBe(6.5)
  })
})
