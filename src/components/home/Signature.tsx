import styles from './Signature.module.css'

/* The hero's picture: a sawtooth's harmonics with a resonant lowpass sweeping
   across them, which is the one gesture this instrument is known for. Drawn
   here rather than reusing the panel, whose artwork is a traced scan meant to
   be read at full size and is some seventeen hundred nodes — a decoration is
   not worth that, and the panel is a page away.

   The curve is wider than the frame on both sides so the sweep never shows an
   end; the root svg clips it. Ids are prefixed because gradient and filter ids
   are document-global and the panel declares its own. */

const BASELINE = 190
const TALLEST = 150

/* 1/n, the amplitude of a sawtooth's nth harmonic — the shape the filter is
   cutting into, so the picture is of this instrument rather than of bars. */
const HARMONICS = Array.from({ length: 16 }, (_, index) => ({
  x: 34 + index * 38,
  height: Math.max(TALLEST / (index + 1), 3),
}))

const CURVE =
  'M -260 70 L 200 70 C 246 70 262 68 276 52 C 288 38 300 34 312 42 ' +
  'C 330 54 344 92 364 128 C 386 166 412 186 452 189 L 900 190'

export function Signature() {
  return (
    <svg
      className={styles.signature}
      viewBox="0 0 640 220"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="homeSignatureWash" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--star)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--star)" stopOpacity="0" />
        </linearGradient>
        <filter id="homeSignatureGlow" x="-20%" y="-40%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="6" result="blurred" />
          <feMerge>
            <feMergeNode in="blurred" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g className={styles.harmonics}>
        {HARMONICS.map((bar) => (
          <rect
            key={bar.x}
            x={bar.x}
            y={BASELINE - bar.height}
            width="6"
            height={bar.height}
            rx="3"
          />
        ))}
      </g>

      <line className={styles.floor} x1="0" y1={BASELINE} x2="640" y2={BASELINE} />

      <g className={styles.sweep}>
        <path className={styles.wash} d={`${CURVE} L 900 ${BASELINE} L -260 ${BASELINE} Z`} />
        <path className={styles.curve} d={CURVE} filter="url(#homeSignatureGlow)" />
      </g>
    </svg>
  )
}
