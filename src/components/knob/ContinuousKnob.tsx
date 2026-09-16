import { memo, useCallback, useId, useRef } from 'react'
import {
  decimalsFor,
  quantise,
  scaleMarks,
  type ContinuousKnobDef,
} from '../../controls/continuousKnob.ts'
import {
  CENTRE,
  LABEL_RADIUS,
  TICK_INNER,
  TICK_OUTER,
  VIEWBOX,
} from './dialArtwork.ts'
import { KnobBody } from './KnobBody.tsx'
import { angleForFraction, pointAt } from './dialGeometry.ts'
import styles from './ContinuousKnob.module.css'

function angleFor(def: ContinuousKnobDef, value: number): number {
  return angleForFraction((value - def.min) / (def.max - def.min))
}

/* Fixed: the printed scale does not turn with the knob. Depends only on the
   definition, so it renders once however much the value moves. */
const Scale = memo(function Scale({ def }: { def: ContinuousKnobDef }) {
  return (
    <g>
      {scaleMarks(def).map((mark) => {
        const angle = angleFor(def, mark.value)
        const inner = pointAt(angle, TICK_INNER)
        const outer = pointAt(angle, TICK_OUTER)
        const label = pointAt(angle, LABEL_RADIUS)
        return (
          <g key={mark.value}>
            <line
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              className={mark.labelled ? styles.tickMajor : styles.tick}
            />
            {mark.labelled && (
              <text
                x={label.x}
                y={label.y}
                className={styles.scaleText}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {mark.value}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
})

export interface ContinuousKnobProps {
  def: ContinuousKnobDef
  value: number
  onChange: (value: number) => void
}

export function ContinuousKnob({ def, value, onChange }: ContinuousKnobProps) {
  const labelId = useId()
  const current = quantise(def, value)
  const angle = angleFor(def, current)
  const drag = useRef<{ y: number; value: number } | null>(null)

  const nudge = useCallback(
    (steps: number) => onChange(quantise(def, current + steps * def.step)),
    [def, current, onChange],
  )

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const act = (fn: () => void) => {
        event.preventDefault()
        fn()
      }
      /* Shift gives a coarse nudge of ten steps; without it a 0.1-step knob would
         need a hundred presses to cross its range. */
      const coarse = event.shiftKey ? 10 : 1
      if (event.key === 'ArrowUp' || event.key === 'ArrowRight') act(() => nudge(coarse))
      else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') act(() => nudge(-coarse))
      else if (event.key === 'Home') act(() => onChange(def.min))
      else if (event.key === 'End') act(() => onChange(def.max))
    },
    [def, nudge, onChange],
  )

  /* Vertical drag across 160px covers the whole range, so a knob with a wide
     range is not unusably slow while a narrow one stays controllable. */
  const onPointerDown = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (event.button !== 0) return
      event.currentTarget.setPointerCapture(event.pointerId)
      drag.current = { y: event.clientY, value: current }
    },
    [current],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const origin = drag.current
      if (!origin) return
      const travel = (origin.y - event.clientY) / 160
      const next = quantise(def, origin.value + travel * (def.max - def.min))
      if (next !== current) onChange(next)
    },
    [def, current, onChange],
  )

  const endDrag = useCallback(() => {
    drag.current = null
  }, [])

  const size = def.size ?? 'small'

  return (
    <div className={styles.knob}>
      <span className={styles.header} id={labelId}>
        {def.label}
      </span>
      <svg
        viewBox={`${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.width} ${VIEWBOX.height}`}
        className={styles.dial}
        data-size={size}
        role="slider"
        tabIndex={0}
        aria-labelledby={labelId}
        aria-valuemin={def.min}
        aria-valuemax={def.max}
        aria-valuenow={current}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <Scale def={def} />
        <KnobBody angle={angle} size={size} />
        <text
          x={CENTRE.x}
          y={CENTRE.y}
          className={styles.capText}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {current.toFixed(decimalsFor(def))}
        </text>
      </svg>
    </div>
  )
}
