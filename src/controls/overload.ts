import type { ControlValue } from './types.ts'

/* What lights the Overload lamp.
 *
 * On the instrument the external input runs into a three-transistor high-gain
 * preamp, and a Schmitt trigger watching that preamp's output drives the lamp.
 * Two things follow from the wiring, and both are why the lamp is not simply
 * "external input past 8":
 *
 * - The external input is normalled after the Main Output stage, so with
 *   nothing plugged in the preamp is listening to the instrument's own output.
 *   Turning External Input Volume up closes that loop on itself, which is the
 *   feedback trick, and with the output wide open it lights the lamp past
 *   roughly 8 with nothing played. The Main Output knob is in that loop too,
 *   so turning the instrument down turns the lamp down with it.
 * - Anything the instrument is already making goes round that loop too, so a
 *   loud patch lights the lamp at a far lower setting than a quiet one.
 *
 * A Schmitt trigger is a threshold, not a dimmer, so a steady tone would light
 * the lamp flat out. What makes it appear to glow at different strengths is
 * that it is being driven by audio: the lamp is only lit for the part of each
 * cycle above the threshold, and the eye averages the flicker. The further
 * past the threshold the signal is, the more of each cycle is above it, and
 * the brighter it reads. That is what `overloadGlow` returns.
 *
 * What the panel cannot know is the instantaneous signal — which is quite
 * right, and it is why the level here is the steady state of a held note:
 * the mixer's sources summed, held at the loudness contour's sustain. How long
 * the lamp takes to get there is the contour's attack, which the panel does
 * know, so a bass with a fast attack snaps it on and a slow pad brings it up
 * over seconds. See overloadRiseMs.
 *
 * The thresholds are calibrated to the one measurement there is: nothing
 * plugged in, nothing playing, output wide open, lighting as External Input
 * Volume passes 8.
 */

type Values = Readonly<Record<string, ControlValue>>

const level = (values: Values, id: string): number => {
  const raw = values[id]
  return typeof raw === 'number' ? Math.min(1, Math.max(0, raw / 10)) : 0
}

const isOn = (values: Values, id: string): boolean => values[id] === 'on'

const enabled = (values: Values, volume: string, source: string): number =>
  isOn(values, source) ? level(values, volume) : 0

/* The preamp hears the instrument whatever else is plugged in, because the
   external input sits after the output stage. One unit is "as loud as the
   instrument gets on its own". */
const LOOP_HUM = 1

/* How much louder the loop runs when the instrument is actually playing. */
const PROGRAMME_GAIN = 1.5

/* Where the Schmitt trigger fires, in the same units: External Input Volume at
   8 with nothing playing. */
export const OVERLOAD_THRESHOLD = 0.8

/* What the instrument is putting out with a key held down: the mixer's own
   sources, summed and held at the loudness contour's sustain. Three oscillators
   wide open is the loudest it goes, so that is one. */
export function programmeLevel(values: Values): number {
  const sources =
    enabled(values, 'osc1Volume', 'osc1Enable') +
    enabled(values, 'osc2Volume', 'osc2Enable') +
    enabled(values, 'osc3Volume', 'osc3Enable') +
    enabled(values, 'noiseVolume', 'noiseEnable')
  return Math.min(1, sources / 3) * level(values, 'loudnessSustainLevel')
}

/* What the loop is carrying: everything the preamp hears has come through the
   output stage, so the Main Output knob scales all of it, and the Main Output
   switch breaks it. */
function outputLevel(values: Values): number {
  return isOn(values, 'mainOutput') ? level(values, 'mainVolume') : 0
}

/* The signal at the preamp's output, in threshold units. */
export function overloadDrive(values: Values): number {
  const external = isOn(values, 'externalInputEnable')
    ? level(values, 'externalInputVolume')
    : 0
  return (
    external * outputLevel(values) * (LOOP_HUM + PROGRAMME_GAIN * programmeLevel(values))
  )
}

/* 0 when the trigger never fires, 1 when the signal is so far past it that the
   lamp is lit for effectively the whole cycle. */
export function overloadGlow(values: Values): number {
  const drive = overloadDrive(values)
  if (drive <= OVERLOAD_THRESHOLD) return 0
  return Math.min(1, (drive - OVERLOAD_THRESHOLD) / OVERLOAD_THRESHOLD)
}

/* How long the lamp takes to reach that: the loudness contour's attack on the
   way up, its decay on the way down, because the lamp is only ever showing the
   envelope of what is being played. Below a few milliseconds it reads as
   instant, which is what a fast attack looks like. */
export function overloadRiseMs(values: Values, brightening: boolean): number {
  const raw = values[brightening ? 'loudnessAttackTime' : 'loudnessDecayTime']
  return typeof raw === 'number' ? Math.max(0, raw) : 0
}
