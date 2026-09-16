/* Code is the authority on what instruments exist, not data: an instrument is a
   control registry, its artwork and its codecs. A patch stores the id rather
   than the name so that renaming one stays a display change. */

export interface Instrument {
  readonly id: string
  readonly name: string
}

export const MINIMOOG_MODEL_D: Instrument = {
  id: 'minimoog-model-d',
  name: 'Minimoog Model D',
}

export const INSTRUMENTS: readonly Instrument[] = [MINIMOOG_MODEL_D]

export const DEFAULT_INSTRUMENT = MINIMOOG_MODEL_D

export function instrumentById(id: string): Instrument | undefined {
  return INSTRUMENTS.find((instrument) => instrument.id === id)
}

/* Falls back to the id so a patch from a later build is still listed. */
export function instrumentName(id: string): string {
  return instrumentById(id)?.name ?? id
}
