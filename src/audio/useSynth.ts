import { useEffect, useSyncExternalStore } from 'react'
import type { ControlValue } from '@controls/types.ts'
import type { Synth, SynthState } from './engine.ts'
import { settingsFrom } from './settings.ts'

type Values = Readonly<Record<string, ControlValue>>

/* Hands the panel to the instrument after every render, with no dependency
   array on purpose: the panel arrives as a fresh object each time, so a
   dependency would compare identities that are never equal. What stops that
   being wasteful is the engine, which diffs the reading it is given and touches
   only what moved. */
export function useSynthSettings(instrument: Synth, values: Values): void {
  useEffect(() => {
    instrument.apply(settingsFrom(values))
  })
}

export function useSynthState(instrument: Synth): SynthState {
  return useSyncExternalStore(instrument.subscribe, instrument.snapshot, instrument.snapshot)
}
