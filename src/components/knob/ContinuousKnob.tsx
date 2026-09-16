import { memo, useCallback, useId, useRef, useState } from 'react'
import {
  formatValue,
  hasNamedMarks,
  quantise,
  scaleMarks,
  type ContinuousKnobDef,
} from '../../controls/continuousKnob.ts'
import {
  CENTRE,
  LABEL_RADIUS,
  SIZE_SCALE,
  TICK_INNER,
  TICK_OUTER,
  VIEWBOX,
} from './dialArtwork.ts'
import { KnobBody } from './KnobBody.tsx'
import { angleForFraction, pointAt } from './dialGeometry.ts'
import { ValueEntry } from './ValueEntry.tsx'
import styles from './ContinuousKnob.module.css'

/* The cap is a fixed circle but the reading is not a fixed width: "8" and
   "-7.41" have to sit in the same 40 units. Shrinking past three characters
   keeps the longer ones inside the cap instead of spilling over its edge. */
function capFontSize(length: number): number {
  if (length <= 3) return 15
  if (length === 4) return 13
  if (length === 5) return 11
  return 9
}

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
            {mark.labelled &&
              (mark.lines ? (
                <text
                  x={label.x}
                  y={label.y}
                  className={styles.namedText}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {mark.lines.map((line, row) => (
                    <tspan
                      key={line}
                      x={label.x}
                      dy={row === 0 ? -((mark.lines!.length - 1) * 4) : 8}
                    >
                      {line}
                    </tspan>
                  ))}
                </text>
              ) : (
                <text
                  x={label.x}
                  y={label.y}
                  className={styles.scaleText}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {mark.value}
                </text>
              ))}
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
  /* Set when the layout heads this knob elsewhere — a column heading, or the
     switch beside it. The label still reaches a screen reader, which has no way
     to associate a heading two cells away. */
  hideHeader?: boolean
}

export function ContinuousKnob({ def, value, onChange, hideHeader }: ContinuousKnobProps) {
  const labelId = useId()
  const current = quantise(def, value)
  const angle = angleFor(def, current)
  const drag = useRef<{ y: number; value: number } | null>(null)
  /* The dial that was double-clicked, which is both the flag that an editor
     is open and what it floats over. */
  const [editing, setEditing] = useState<Element | null>(null)

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
  /* Words at the ends of the sweep run wider than a numeral, so the box is
     widened for them and the element sized from it at one pixel per unit — the
     dial stays the same size on the panel, it just gains margin. Only as much as
     the longest of them overhangs by: this margin is dead width in every column
     the knob shares, and the panel sets those words tight under the dial. */
  const box = hasNamedMarks(def) ? { ...VIEWBOX, x: VIEWBOX.x - 8, width: VIEWBOX.width + 16 } : VIEWBOX
  const scale = SIZE_SCALE[size]
  const reading = formatValue(def, current)

  return (
    <div className={styles.knob}>
      {!hideHeader && (
        <span className={styles.header} id={labelId}>
          {def.label}
        </span>
      )}
      <div className={styles.dialWrap}>
      <svg
        viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
        className={styles.dial}
        style={{ width: box.width * scale, height: box.height * scale }}
        data-size={size}
        role="slider"
        tabIndex={0}
        aria-labelledby={hideHeader ? undefined : labelId}
        aria-label={hideHeader ? def.label : undefined}
        aria-valuemin={def.min}
        aria-valuemax={def.max}
        aria-valuenow={current}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={(event) => setEditing(event.currentTarget)}
      >
        <Scale def={def} />
        <KnobBody angle={angle} />
        <text
          x={CENTRE.x}
          y={CENTRE.y}
          className={styles.capText}
          style={{ fontSize: capFontSize(reading.length) }}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {reading}
        </text>
      </svg>
      {editing && (
        <ValueEntry
          anchorEl={editing}
          /* The stored value, not the displayed one. The dial prints a tenth
             while the control stores a hundredth, so pre-filling what is on
             screen would let opening and closing the editor quietly round 3.23
             down to 3.2. */
          initial={String(current)}
          parse={(text) => {
            const parsed = Number(text.trim().replace(',', '.'))
            return Number.isFinite(parsed) && text.trim() !== '' ? quantise(def, parsed) : null
          }}
          onCommit={onChange}
          onClose={() => setEditing(null)}
        />
      )}
      </div>
    </div>
  )
}
