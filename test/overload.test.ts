import { describe, expect, test } from 'bun:test'
import { panelRegistry } from '@controls/panel.ts'
import { defaultValues } from '@controls/registry.ts'
import {
  OVERLOAD_THRESHOLD,
  overloadDrive,
  overloadGlow,
  overloadRiseMs,
  programmeLevel,
} from '@controls/overload.ts'
import type { ControlValue } from '@controls/types.ts'

/* Pins the behaviour the lamp reproduces, not the arithmetic behind it. */

const panel = (overrides: Record<string, ControlValue>): Record<string, ControlValue> => ({
  ...defaultValues(panelRegistry),
  ...overrides,
})

/* Nothing playing: every source off and silent, with the output wide open,
   which is where the threshold is calibrated. */
const quiet = {
  mainOutput: 'on',
  mainVolume: 10,
  osc1Enable: 'off',
  osc2Enable: 'off',
  osc3Enable: 'off',
  noiseEnable: 'off',
  osc1Volume: 0,
  osc2Volume: 0,
  osc3Volume: 0,
  noiseVolume: 0,
  loudnessSustainLevel: 0,
} as const

describe('with nothing plugged in and nothing playing', () => {
  test('the lamp is out until External Input Volume passes 8', () => {
    /* The measurement everything else is calibrated to. */
    expect(overloadGlow(panel({ ...quiet, externalInputEnable: 'on', externalInputVolume: 7 })))
      .toBe(0)
    expect(overloadGlow(panel({ ...quiet, externalInputEnable: 'on', externalInputVolume: 8 })))
      .toBe(0)
    expect(overloadGlow(panel({ ...quiet, externalInputEnable: 'on', externalInputVolume: 8.5 })))
      .toBeGreaterThan(0)
  })

  test('and brighter the further past it goes', () => {
    const at = (volume: number) =>
      overloadGlow(panel({ ...quiet, externalInputEnable: 'on', externalInputVolume: volume }))
    expect(at(10)).toBeGreaterThan(at(9))
    expect(at(9)).toBeGreaterThan(at(8.5))
  })

  test('switching the external input out puts it out', () => {
    expect(overloadGlow(panel({ ...quiet, externalInputEnable: 'off', externalInputVolume: 10 })))
      .toBe(0)
  })
})

describe('with the instrument playing into its own input', () => {
  const loud = {
    mainOutput: 'on',
    mainVolume: 10,
    externalInputEnable: 'on',
    osc1Enable: 'on',
    osc2Enable: 'on',
    osc3Enable: 'on',
    osc1Volume: 10,
    osc2Volume: 10,
    osc3Volume: 10,
    loudnessSustainLevel: 10,
  } as const

  test('a loud patch lights it far below 8', () => {
    expect(overloadGlow(panel({ ...loud, externalInputVolume: 4 }))).toBeGreaterThan(0)
    expect(overloadGlow(panel({ ...quiet, externalInputEnable: 'on', externalInputVolume: 4 })))
      .toBe(0)
  })

  test('a patch that sustains at nothing is a quiet one', () => {
    const held = panel({ ...loud, loudnessSustainLevel: 0, externalInputVolume: 4 })
    expect(programmeLevel(held)).toBe(0)
    expect(overloadGlow(held)).toBe(0)
  })

  test('turning the sources down puts it out again', () => {
    const before = overloadGlow(panel({ ...loud, externalInputVolume: 5 }))
    const after = overloadGlow(
      panel({ ...loud, externalInputVolume: 5, osc1Volume: 1, osc2Volume: 0, osc3Volume: 0 }),
    )
    expect(before).toBeGreaterThan(after)
  })

  test('the threshold is where the drive crosses it, by definition', () => {
    const edge = panel({ ...quiet, externalInputEnable: 'on', externalInputVolume: 8 })
    expect(overloadDrive(edge)).toBeCloseTo(OVERLOAD_THRESHOLD, 10)
  })
})

describe('how long it takes to light', () => {
  test('is the loudness contour rising, and its decay falling', () => {
    const values = panel({ loudnessAttackTime: 10, loudnessDecayTime: 4000 })
    expect(overloadRiseMs(values, true)).toBe(10)
    expect(overloadRiseMs(values, false)).toBe(4000)
  })
})

describe('the output stage is in the loop', () => {
  const lighting = {
    ...quiet,
    externalInputEnable: 'on',
    externalInputVolume: 10,
  } as const

  test('turning the instrument down turns the lamp down with it', () => {
    expect(overloadGlow(panel({ ...lighting, mainVolume: 10 }))).toBeGreaterThan(
      overloadGlow(panel({ ...lighting, mainVolume: 7 })),
    )
    expect(overloadGlow(panel({ ...lighting, mainVolume: 5 }))).toBe(0)
  })

  test('switching the main output off breaks the loop', () => {
    expect(overloadGlow(panel({ ...lighting, mainOutput: 'off' }))).toBe(0)
  })
})
