import { memo, useCallback, useId, useRef, useState } from 'react'
import {
  formatMs,
  fractionForMs,
  maxMs,
  minMs,
  msAtFraction,
  parseTimeInput,
  quantiseMs,
  scaleLabel,
  stepFractionOf,
  type TimeKnobDef,
} from '../../controls/timeKnob.ts'
import { CENTRE, LABEL_RADIUS, TICK_INNER, TICK_OUTER, VIEWBOX } from './dialArtwork.ts'
import { KnobBody } from './KnobBody.tsx'
import { angleForFraction, pointAt } from './dialGeometry.ts'
import { ValueEntry } from './ValueEntry.tsx'
import styles from './ContinuousKnob.module.css'

/* The marks sit at even intervals around the dial even though their values do
   not, which is the whole point of this control. The panel prints a numeral on
   every other mark — which lands on 10, 200, 600, 1, 5, 10, exactly the six the
   sheet carries — and names the unit once at each end. */
const Scale = memo(function Scale({ def }: { def: TimeKnobDef }) {
  const segments = def.anchors.length - 1
  const units = def.unitLabels ?? { low: 'M-SEC.', high: 'SEC.' }
  const lowCaption = pointAt(angleForFraction(0.06), LABEL_RADIUS + 8)
  const highCaption = pointAt(angleForFraction(0.94), LABEL_RADIUS + 8)

  return (
    <g>
      {def.anchors.map((ms, index) => {
        const angle = angleForFraction(index / segments)
        const inner = pointAt(angle, TICK_INNER)
        const outer = pointAt(angle, TICK_OUTER)
        const label = pointAt(angle, LABEL_RADIUS)
        const labelled = index % 2 === 1
        return (
          <g key={ms}>
            <line
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              className={styles.tick}
            />
            {labelled && (
              <text
                x={label.x}
                y={label.y}
                className={styles.scaleText}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {scaleLabel(ms)}
              </text>
            )}
          </g>
        )
      })}
      <text x={lowCaption.x} y={lowCaption.y} className={styles.unitText} textAnchor="middle">
        {units.low}
      </text>
      <text x={highCaption.x} y={highCaption.y} className={styles.unitText} textAnchor="middle">
        {units.high}
      </text>
    </g>
  )
})

export interface TimeKnobProps {
  def: TimeKnobDef
  value: number
  onChange: (value: number) => void
  /* Set when the layout heads this knob elsewhere — a column heading, or the
     switch beside it. The label still reaches a screen reader, which has no way
     to associate a heading two cells away. */
  hideHeader?: boolean
}

export function TimeKnob({ def, value, onChange, hideHeader }: TimeKnobProps) {
  const labelId = useId()
  const current = quantiseMs(def, value)
  const fraction = fractionForMs(def, current)
  const drag = useRef<{ y: number; fraction: number } | null>(null)
  /* The dial that was double-clicked, which is both the flag that an editor
     is open and what it floats over. */
  const [editing, setEditing] = useState<Element | null>(null)

  /* Nudging moves by a fraction of travel, never by a fixed number of
     milliseconds, so a press feels the same at both ends of a scale whose value
     spans four orders of magnitude. */
  const nudge = useCallback(
    (steps: number) => {
      const next = fraction + steps * stepFractionOf(def)
      onChange(quantiseMs(def, msAtFraction(def, next)))
    },
    [def, fraction, onChange],
  )

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const act = (fn: () => void) => {
        event.preventDefault()
        fn()
      }
      const coarse = event.shiftKey ? 10 : 1
      if (event.key === 'ArrowUp' || event.key === 'ArrowRight') act(() => nudge(coarse))
      else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') act(() => nudge(-coarse))
      else if (event.key === 'Home') act(() => onChange(minMs(def)))
      else if (event.key === 'End') act(() => onChange(maxMs(def)))
    },
    [def, nudge, onChange],
  )

  const onPointerDown = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (event.button !== 0) return
      event.currentTarget.setPointerCapture(event.pointerId)
      drag.current = { y: event.clientY, fraction }
    },
    [fraction],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const origin = drag.current
      if (!origin) return
      const next = origin.fraction + (origin.y - event.clientY) / 160
      const ms = quantiseMs(def, msAtFraction(def, next))
      if (ms !== current) onChange(ms)
    },
    [def, current, onChange],
  )

  const endDrag = useCallback(() => {
    drag.current = null
  }, [])

  return (
    <div className={styles.knob}>
      {!hideHeader && (
        <span className={styles.header} id={labelId}>
          {def.label}
        </span>
      )}
      <div className={styles.dialWrap}>
      <svg
        viewBox={`${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.width} ${VIEWBOX.height}`}
        className={styles.dial}
        role="slider"
        tabIndex={0}
        aria-labelledby={hideHeader ? undefined : labelId}
        aria-label={hideHeader ? def.label : undefined}
        aria-valuemin={minMs(def)}
        aria-valuemax={maxMs(def)}
        aria-valuenow={current}
        aria-valuetext={formatMs(current)}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={(event) => setEditing(event.currentTarget)}
      >
        <Scale def={def} />
        <KnobBody angle={angleForFraction(fraction)} size={def.size ?? 'small'} />
        <text
          x={CENTRE.x}
          y={CENTRE.y}
          className={styles.capTimeText}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {formatMs(current)}
        </text>
      </svg>
      {editing && (
        <ValueEntry
          anchorEl={editing}
          initial={formatMs(current)}
          parse={(text) => {
            const ms = parseTimeInput(text)
            return ms === null ? null : quantiseMs(def, ms)
          }}
          onCommit={onChange}
          onClose={() => setEditing(null)}
        />
      )}
      </div>
    </div>
  )
}
