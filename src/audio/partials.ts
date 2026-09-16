/* The six waveform positions as harmonics.
 *
 * Web Audio can build any repeating wave from a Fourier series, which is how
 * the three the browser does not offer are made: the pulses are a square with
 * the duty cycle moved, and the triangle-saw is what the panel draws, a triangle
 * leaning until it is nearly a sawtooth.
 *
 * The series are band-limited by construction, since a table with a highest
 * harmonic cannot alias below it. That is the reason for building tables at all
 * rather than drawing the shapes sample by sample.
 *
 * Nothing here is measured. The panel prints the shape of each wave and no
 * spectrum, so these are the textbook series for the shapes it draws; the one
 * number that is a choice, a pulse's duty cycle, is named where it is used.
 */

export type WaveId =
  | 'triangle'
  | 'triangleSaw'
  | 'sawtooth'
  | 'reverseSawtooth'
  | 'square'
  | 'widePulse'
  | 'narrowPulse'

export interface Partials {
  readonly real: Float32Array
  readonly imag: Float32Array
}

/* Enough harmonics that the lowest note keeps its edge and the highest does not
   fold: the bottom key at LO is a few hertz, so the top of this series is still
   well inside the audible band there, and a table is band-limited whatever note
   it is played at. */
export const PARTIAL_COUNT = 64

/* A pulse is a square whose two halves are uneven. The instrument prints WIDE
   and NARROW rather than a figure, so these two are ours: a third and a tenth,
   which are far enough apart to sound like different waves. */
const WIDE_DUTY = 1 / 3
const NARROW_DUTY = 1 / 10

/* How far the triangle-saw has leaned. The panel draws it most of the way to a
   sawtooth, which is a triangle with its rise and fall made uneven. */
const TRIANGLE_SAW_LEAN = 0.8

function build(coefficient: (n: number) => number, sign = 1): Partials {
  const real = new Float32Array(PARTIAL_COUNT)
  const imag = new Float32Array(PARTIAL_COUNT)
  for (let n = 1; n < PARTIAL_COUNT; n += 1) imag[n] = sign * coefficient(n)
  return { real, imag }
}

/* A triangle whose rise and fall are uneven, which is one shape covering the
   triangle, the sawtooth and everything the panel draws between them: at lean 0
   the rise takes half the cycle and it is a triangle, and as the lean approaches
   1 the rise shortens to nothing and it is a sawtooth. */
function leaningTriangle(lean: number): Partials {
  const rise = (1 - lean) / 2
  return build(
    (n) => (2 * Math.sin(n * Math.PI * rise)) / (n * n * Math.PI * Math.PI * rise * (1 - rise)),
  )
}

function pulse(duty: number): Partials {
  return build((n) => (2 / (n * Math.PI)) * Math.sin(Math.PI * n * duty))
}

const TABLE: Readonly<Record<WaveId, () => Partials>> = {
  /* Odd harmonics falling as 1/n², the quietest-sounding wave on the knob. */
  triangle: () => build((n) => (n % 2 === 1 ? 1 / (n * n) : 0)),
  triangleSaw: () => leaningTriangle(TRIANGLE_SAW_LEAN),
  /* Every harmonic, falling as 1/n. */
  sawtooth: () => build((n) => 1 / n),
  /* The same wave upside down. Alone it is indistinguishable from a sawtooth,
     and against another oscillator it is not, which is the point of Oscillator-3
     carrying one where the others carry a triangle-saw. */
  reverseSawtooth: () => build((n) => 1 / n, -1),
  square: () => pulse(1 / 2),
  widePulse: () => pulse(WIDE_DUTY),
  narrowPulse: () => pulse(NARROW_DUTY),
}

export function partialsFor(wave: WaveId): Partials {
  return TABLE[wave]()
}

export const WAVE_IDS = Object.keys(TABLE) as readonly WaveId[]
