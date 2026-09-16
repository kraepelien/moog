import { useId, useRef, useState } from 'react'
import {
  quantiseWheel,
  wheelDecimals,
  wheelFraction,
  type WheelDef,
} from '../../controls/wheel.ts'
import {
  FACE,
  FRAME,
  MARKER,
  MARKER_TRAVEL,
  RIB_HEIGHT,
  RIB_WIDTH,
  RIB_X,
  VIEWBOX,
  markerY,
  ribTops,
  surfaceShift,
} from './wheelArtwork.ts'
import { ValueEntry } from '../knob/ValueEntry.tsx'
import styles from './Wheel.module.css'

export interface WheelProps {
  def: WheelDef
  value: number
  onChange: (value: number) => void
}

export function Wheel({ def, value, onChange }: WheelProps) {
  const labelId = useId()
  /* The surface is clipped to the face so ribs turning past either end are cut
     off by the frame, which is also where the export's two short end bands come
     from. One id per wheel, since two of them sit side by side. */
  const clipId = useId()
  const current = quantiseWheel(def, value)
  const fraction = wheelFraction(def, current)
  const drag = useRef<{ y: number; value: number } | null>(null)
  /* The strip that was double-clicked, which is both the flag that an editor
     is open and what it floats over. */
  const [editing, setEditing] = useState<Element | null>(null)

  /* Plain functions rather than useCallback: every handler here lands on a DOM
     element, never on a memoized child, so a stable identity buys nothing — and
     endDrag reads the drag ref, which the React Compiler cannot prove keeps the
     memoization valid. */
  const nudge = (steps: number) => onChange(quantiseWheel(def, current + steps * def.step))

  const onKeyDown = (event: React.KeyboardEvent) => {
    const act = (fn: () => void) => {
      event.preventDefault()
      fn()
    }
    const coarse = event.shiftKey ? 10 : 1
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') act(() => nudge(coarse))
    else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') act(() => nudge(-coarse))
    else if (event.key === 'Home') act(() => onChange(def.min))
    else if (event.key === 'End') act(() => onChange(def.max))
  }

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { y: event.clientY, value: current }
  }

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const origin = drag.current
    if (!origin) return
    const height = event.currentTarget.getBoundingClientRect().height || 1
    /* The wheel's own travel maps one-to-one onto its drawn height, so the marker
       tracks the pointer whatever size the wheel happens to be drawn at. */
    const perPixel = (VIEWBOX.height / height) * ((def.max - def.min) / MARKER_TRAVEL)
    const next = quantiseWheel(def, origin.value + (origin.y - event.clientY) * perPixel)
    if (next !== current) onChange(next)
  }

  /* A sprung wheel returns the moment it is let go, as the real one does — it
     cannot hold a position once your hand leaves it. Guarded on an actual drag
     having started, so a stray pointer-up over the wheel cannot discard a value
     that was set from the keyboard. */
  const endDrag = () => {
    if (!drag.current) return
    drag.current = null
    if (def.springsTo !== undefined) onChange(def.springsTo)
  }

  return (
    <div className={styles.wheel}>
      <div className={styles.stripWrap}>
      <svg
        viewBox={`${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.width} ${VIEWBOX.height}`}
        className={styles.strip}
        role="slider"
        tabIndex={0}
        aria-labelledby={labelId}
        aria-orientation="vertical"
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
        <defs>
          <clipPath id={clipId}>
            <rect {...FACE} />
          </clipPath>
        </defs>
        <rect {...FRAME} className={styles.frame} />
        <rect {...FACE} className={styles.face} />
        <g clipPath={`url(#${clipId})`}>
          {ribTops(surfaceShift(fraction)).map((y) => (
            <rect
              key={y}
              x={RIB_X}
              y={y}
              width={RIB_WIDTH}
              height={RIB_HEIGHT}
              className={styles.rib}
            />
          ))}
          <circle
            cx={MARKER.cx}
            cy={markerY(fraction)}
            r={MARKER.radius}
            className={styles.marker}
          />
        </g>
      </svg>
      {editing && (
        <ValueEntry
          anchorEl={editing}
          /* The stored value, not the displayed one — see ContinuousKnob. */
          initial={String(current)}
          parse={(text) => {
            const parsed = Number(text.trim().replace(',', '.'))
            return Number.isFinite(parsed) && text.trim() !== '' ? quantiseWheel(def, parsed) : null
          }}
          onCommit={onChange}
          onClose={() => setEditing(null)}
        />
      )}
      </div>
      <span className={styles.header} id={labelId}>
        {def.label}
      </span>
      <span className={styles.reading}>{current.toFixed(wheelDecimals(def))}</span>
    </div>
  )
}
