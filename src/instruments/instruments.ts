/* Which instruments exist.
 *
 * One today. The table is here rather than implied so that a patch can say what
 * it is for with a stable slug rather than a display string, and so the day a
 * second instrument arrives there is a list to add it to instead of a search
 * for every place "Minimoog Model D" was written down.
 *
 * Code is the authority, not data: an instrument is a control registry, its
 * artwork and its codecs, all of which live in src/. A row in a database
 * describing an instrument nothing can draw would be a row describing nothing.
 */

export interface Instrument {
  /* Stable, filename- and URL-safe, and what a patch stores. */
  readonly id: string
  /* What a person reads. Changing this is a display change; changing the id
     above is a format change. */
  readonly name: string
}

export const MINIMOOG_MODEL_D: Instrument = {
  id: 'minimoog-model-d',
  name: 'Minimoog Model D',
}

export const INSTRUMENTS: readonly Instrument[] = [MINIMOOG_MODEL_D]

/* The one every patch is for until there is a choice to make. */
export const DEFAULT_INSTRUMENT = MINIMOOG_MODEL_D

export function instrumentById(id: string): Instrument | undefined {
  return INSTRUMENTS.find((instrument) => instrument.id === id)
}

/* What to call an instrument this build has never heard of: its own id, rather
   than a blank or a guess. A patch from a later build must still be listed. */
export function instrumentName(id: string): string {
  return instrumentById(id)?.name ?? id
}

/* Patches written before instruments were named carry the display string in
   `synth`. Mapped rather than slugified: a slug derived from free text is a
   guess, and this is the one value that was ever in that field. */
export function instrumentIdFor(synth: unknown): string {
  if (typeof synth === 'string') {
    const named = INSTRUMENTS.find((instrument) => instrument.name === synth)
    if (named) return named.id
  }
  return DEFAULT_INSTRUMENT.id
}
