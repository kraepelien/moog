import { memo } from 'react'
import {
  BODY,
  BODY_WIDTH,
  CAP_RADIUS,
  CENTRE,
  EXPORT_CENTRE,
  fitTransform,
  INDICATOR_AT,
  INDICATOR_RADIUS,
} from './dialArtwork.ts'
import styles from './ContinuousKnob.module.css'

/* The scalloped body, its cap and its indicator dot turn together, exactly as
   exported. Two groups rather than one: the outer turns by the value, the inner
   fits the export's own coordinates onto the dial, so neither has to be
   expressed in the other's units.

   Memoized on primitives so turning one knob does not repaint the others — the
   body alone is a few hundred path nodes. */
export const KnobBody = memo(function KnobBody({
  angle,
  centre = CENTRE,
  width = BODY_WIDTH,
}: {
  angle: number
  /* Given by a dial drawn around a different point or at a different size — the
     oscillator selectors are both. */
  centre?: { x: number; y: number }
  width?: number
}) {
  const { x: CX, y: CY } = EXPORT_CENTRE
  return (
    <g transform={`rotate(${angle} ${centre.x} ${centre.y})`}>
      <g transform={fitTransform(centre, width)}>
        <path d={BODY} className={styles.body} />
        <circle cx={CX} cy={CY} r={CAP_RADIUS} className={styles.cap} />
        <circle cx={CX} cy={CY - INDICATOR_AT} r={INDICATOR_RADIUS} className={styles.indicator} />
      </g>
    </g>
  )
})
