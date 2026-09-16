import { memo } from 'react'
import { CAP_RADIUS, CENTRE, INDICATOR_RADIUS, knobSizes, type KnobSize } from './dialArtwork.ts'
import { pointAt } from './dialGeometry.ts'
import styles from './ContinuousKnob.module.css'

/* The scalloped body and its indicator dot turn together, exactly as exported.
   Memoized on two primitives so turning one knob does not repaint the others —
   the body alone is a few hundred path nodes. */
export const KnobBody = memo(function KnobBody({
  angle,
  size,
}: {
  angle: number
  size: KnobSize
}) {
  const art = knobSizes[size]
  const dot = pointAt(art.bakedAngle, art.indicatorRadius)
  return (
    <g transform={`rotate(${angle - art.bakedAngle} ${CENTRE.x} ${CENTRE.y})`}>
      <path d={art.body} className={styles.body} />
      <circle cx={CENTRE.x} cy={CENTRE.y} r={CAP_RADIUS} className={styles.cap} />
      <circle cx={dot.x} cy={dot.y} r={INDICATOR_RADIUS} className={styles.indicator} />
    </g>
  )
})
