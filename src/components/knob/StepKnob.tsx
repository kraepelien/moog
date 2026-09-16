import { memo, useCallback, useId, useRef, useState } from 'react'
import { positionIndex, stepBy, type StepKnobDef } from '../../controls/stepKnob.ts'
import {
  BAKED_ANGLE,
  CAP,
  CENTRE,
  DETENT_ANGLES,
  INNER_RING,
  LABEL_RADIUS,
  OUTER_RING,
  POINTER,
  TICKS,
  VIEWBOX,
} from './artwork.ts'
import { waveformGlyphs, type WaveformId } from './waveforms.ts'
import { PositionPicker } from './PositionPicker.tsx'
import styles from './StepKnob.module.css'

function pointAt(angleDeg: number, radius: number) {
  const radians = ((angleDeg - 90) * Math.PI) / 180
  return {
    x: CENTRE.x + Math.cos(radians) * radius,
    y: CENTRE.y + Math.sin(radians) * radius,
  }
}

/* Drawn separately from the knob so the marks stay upright while the body turns.
   A glyph keeps the coordinates it was exported with, which is already its place
   on the dial, so it needs no transform at all. */
const Labels = memo(function Labels({ def }: { def: StepKnobDef }) {
  return (
    <g className={styles.labels}>
      {def.positions.map((position, index) => {
        const angle = DETENT_ANGLES[index]
        if (angle === undefined) return null

        if (position.glyph && position.glyph in waveformGlyphs) {
          return (
            <path
              key={position.id}
              d={waveformGlyphs[position.glyph as WaveformId].path}
              className={styles.glyph}
            />
          )
        }

        const at = pointAt(angle, LABEL_RADIUS)
        return (
          <text
            key={position.id}
            x={at.x}
            y={at.y}
            className={styles.labelText}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {position.label}
          </text>
        )
      })}
    </g>
  )
})

/* Roughly forty nodes, and its props are two numbers, so it re-renders only when
   the knob actually turns. Dragging one knob must not repaint the rest of them. */
const Body = memo(function Body({ angle }: { angle: number }) {
  return (
    <g transform={`rotate(${angle - BAKED_ANGLE} ${CENTRE.x} ${CENTRE.y})`}>
      <path d={OUTER_RING} fillRule="evenodd" clipRule="evenodd" className={styles.outerRing} />
      <path d={INNER_RING} className={styles.innerRing} />
      <path d={POINTER} className={styles.pointer} />
      <circle cx={CAP.cx} cy={CAP.cy} r={CAP.r} className={styles.cap} />
    </g>
  )
})

/* The same mark that labels the detent, drawn again in the cap so the knob reads
   its own position the way the octave knob does. Scaled and centred from the
   glyph's own bounds rather than a per-glyph offset, so the six sit consistently
   however different their shapes are. Outside the rotating group: the mark must
   stay upright while the body turns.

   Sized against a cap of radius 20, leaving clear margin at the circle's edge. */
const CAP_GLYPH_WIDTH = 15

function CapGlyph({ glyph }: { glyph: WaveformId }) {
  const { path, box } = waveformGlyphs[glyph]
  const scale = CAP_GLYPH_WIDTH / box.width
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  return (
    <g
      transform={`translate(${CAP.cx} ${CAP.cy}) scale(${scale}) translate(${-cx} ${-cy})`}
      className={styles.capGlyph}
      style={{ strokeWidth: 1.5 / scale }}
    >
      <path d={path} />
    </g>
  )
}

/* "8'" and "32'" share one circle. Shrinking past two characters keeps the wider
   octave readings inside the cap rather than over its edge. */
function capFontSize(length: number): number {
  if (length <= 2) return 22
  if (length === 3) return 16
  return 13
}

export interface StepKnobProps {
  def: StepKnobDef
  value: string
  onChange: (value: string) => void
  /* Set when a column heading already names this knob, as the panel does for
     Range and Waveform. The label is still given to a screen reader, which
     cannot see the heading. */
  hideHeader?: boolean
}

export function StepKnob({ def, value, onChange, hideHeader }: StepKnobProps) {
  const labelId = useId()
  const index = positionIndex(def, value)
  const current = def.positions[index]
  const angle = DETENT_ANGLES[index] ?? DETENT_ANGLES[0]
  const dragOrigin = useRef<{ y: number; index: number } | null>(null)
  const [editing, setEditing] = useState(false)

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const by = (delta: number) => {
        event.preventDefault()
        onChange(stepBy(def, value, delta))
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowRight') by(1)
      else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') by(-1)
      else if (event.key === 'Home') by(-def.positions.length)
      else if (event.key === 'End') by(def.positions.length)
    },
    [def, value, onChange],
  )

  /* Vertical drag, a detent every 18px. Pointer capture rather than window
     listeners so a drag that leaves the element still tracks and still ends. */
  const onPointerDown = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (event.button !== 0) return
      event.currentTarget.setPointerCapture(event.pointerId)
      dragOrigin.current = { y: event.clientY, index: positionIndex(def, value) }
    },
    [def, value],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const origin = dragOrigin.current
      if (!origin) return
      const steps = Math.round((origin.y - event.clientY) / 18)
      const next = def.positions[Math.min(def.positions.length - 1, Math.max(0, origin.index + steps))]
      if (next && next.id !== value) onChange(next.id)
    },
    [def, value, onChange],
  )

  const endDrag = useCallback(() => {
    dragOrigin.current = null
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
        aria-valuemin={1}
        aria-valuemax={def.positions.length}
        aria-valuenow={index + 1}
        aria-valuetext={current?.label ?? value}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => setEditing(true)}
      >
        <path d={TICKS} className={styles.ticks} />
        <Labels def={def} />
        <Body angle={angle} />
        {current?.glyph && current.glyph in waveformGlyphs ? (
          <CapGlyph glyph={current.glyph as WaveformId} />
        ) : (
          current?.cap && (
            <text
              x={CAP.cx}
              y={CAP.cy}
              className={styles.capText}
              style={{ fontSize: capFontSize(current.cap.length) }}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {current.cap}
            </text>
          )
        )}
      </svg>
      {editing && (
        <PositionPicker
          positions={def.positions}
          value={current?.id ?? def.default}
          onCommit={onChange}
          onClose={() => setEditing(false)}
        />
      )}
      </div>
    </div>
  )
}
