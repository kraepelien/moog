import type { ControlValue } from './types.ts'

/* The external input is normalled after the Main Output stage, so the preamp
   driving the lamp is listening to the instrument's own output: the lamp
   answers to what is being played and how loud the output is, not to External
   Input Volume alone. A Schmitt trigger drives it, so it flickers at the
   signal rather than dimming, and the eye averages that into a brightness.

   Calibrated to the one measurement there is: nothing plugged in, nothing
   playing, output wide open, lighting as External Input Volume passes 8. */

type Values = Readonly<Record<string, ControlValue>>

const level = (values: Values, id: string): number => {
  const raw = values[id]
  return typeof raw === 'number' ? Math.min(1, Math.max(0, raw / 10)) : 0
}

const isOn = (values: Values, id: string): boolean => values[id] === 'on'

const enabled = (values: Values, volume: string, source: string): number =>
  isOn(values, source) ? level(values, volume) : 0

/* One unit is as loud as the instrument gets on its own. */
const LOOP_HUM = 1
const PROGRAMME_GAIN = 1.5
export const OVERLOAD_THRESHOLD = 0.8

/* A held note, since the panel cannot know the instantaneous signal. Three
   oscillators wide open is the loudest it goes, so that is one. */
export function programmeLevel(values: Values): number {
  const sources =
    enabled(values, 'osc1Volume', 'osc1Enable') +
    enabled(values, 'osc2Volume', 'osc2Enable') +
    enabled(values, 'osc3Volume', 'osc3Enable') +
    enabled(values, 'noiseVolume', 'noiseEnable')
  return Math.min(1, sources / 3) * level(values, 'loudnessSustainLevel')
}

function outputLevel(values: Values): number {
  return isOn(values, 'mainOutput') ? level(values, 'mainVolume') : 0
}

export function overloadDrive(values: Values): number {
  const external = isOn(values, 'externalInputEnable')
    ? level(values, 'externalInputVolume')
    : 0
  return (
    external * outputLevel(values) * (LOOP_HUM + PROGRAMME_GAIN * programmeLevel(values))
  )
}

/* 1 when the signal is so far past the threshold that the lamp is lit for
   effectively the whole cycle. */
export function overloadGlow(values: Values): number {
  const drive = overloadDrive(values)
  if (drive <= OVERLOAD_THRESHOLD) return 0
  return Math.min(1, (drive - OVERLOAD_THRESHOLD) / OVERLOAD_THRESHOLD)
}

/* The lamp shows the envelope of what is played, so a fast attack snaps it on
   and a slow pad brings it up over seconds. */
export function overloadRiseMs(values: Values, brightening: boolean): number {
  const raw = values[brightening ? 'loudnessAttackTime' : 'loudnessDecayTime']
  return typeof raw === 'number' ? Math.max(0, raw) : 0
}
