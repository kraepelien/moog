/* Which key is sounding, and what a change of keys does to the envelopes.
 *
 * The instrument is one voice, so holding two keys is not a chord: the key
 * pressed last wins, and lifting it hands the voice back to whatever is still
 * down. Nor does the second key start the note again. The contours are fired by
 * a key going down on a keyboard that was empty, which is why a phrase played
 * legato slides from note to note under one envelope while a phrase played with
 * gaps articulates every note. Glide is only audible because of this rule.
 *
 * `held` is in the order the keys went down, and last-note priority is the
 * reason that order has to be kept: a set would have lost it.
 */

export function sounding(held: readonly number[]): number | null {
  return held.length === 0 ? null : held[held.length - 1]!
}

export type Trigger = 'attack' | 'glide' | 'release' | 'none'

export function trigger(before: readonly number[], after: readonly number[]): Trigger {
  const was = sounding(before)
  const now = sounding(after)
  if (now === null) return was === null ? 'none' : 'release'
  if (was === null) return 'attack'
  return now === was ? 'none' : 'glide'
}
