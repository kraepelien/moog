import { useCallback, useId } from 'react'
import { positionIndex, type ToggleSwitchDef } from '../../controls/toggleSwitch.ts'
import styles from './ToggleSwitch.module.css'

/* Geometry read off the hand-drawn export "BUTTON.svg", which draws the rocker at
   the right-hand end. The other export is the same switch mirrored, so rather
   than carrying two copies the left-hand state is the same shapes reflected —
   there is one set of coordinates to be wrong about, not two.

   The rocker is two unequal blocks with a hairline between them, the wider one
   always outermost, and a narrow tab sits at the opposite end. */
const BOX = { width: 82, height: 28 }
const BODY = { x: 0.5, y: 0.5, width: 81, height: 27 }
const TAB = { x: 0.5, y: 0.5, width: 6, height: 27 }
const ROCKER_INNER = { x: 41.5, y: 1.5, width: 14, height: 25 }
const ROCKER_OUTER = { x: 56.5, y: 1.5, width: 19, height: 25 }

export interface ToggleSwitchProps {
  def: ToggleSwitchDef
  value: string
  onChange: (value: string) => void
}

export function ToggleSwitch({ def, value, onChange }: ToggleSwitchProps) {
  const labelId = useId()
  const index = positionIndex(def, value)
  const vertical = def.orientation === 'vertical'
  const [first, second] = def.positions

  const toggle = useCallback(() => {
    const next = def.positions[index === 0 ? 1 : 0]
    if (next) onChange(next.id)
  }, [def, index, onChange])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault()
        toggle()
        return
      }
      const to = (target: number) => {
        event.preventDefault()
        const next = def.positions[target]
        if (next) onChange(next.id)
      }
      /* Arrows pick an end rather than toggling, so holding one down cannot
         oscillate the switch. */
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'Home') to(0)
      else if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'End') to(1)
    },
    [def, onChange, toggle],
  )

  /* Drawn for the second position; the first is the same shapes reflected. The
     vertical switch is the horizontal one turned a quarter turn, which maps its
     left end to the top, so the first position reads top and the second bottom. */
  const rockerAtSecond = index === 1
  const inner = `${rockerAtSecond ? '' : `translate(${BOX.width} 0) scale(-1 1)`}`
  const outer = vertical ? `translate(${BOX.height} 0) rotate(90)` : ''

  return (
    <div className={styles.switch} data-orientation={vertical ? 'vertical' : 'horizontal'}>
      {def.headline && (
        <span className={styles.headline} id={labelId}>
          {def.headline}
        </span>
      )}
      {vertical && <span className={styles.endLabel}>{first?.label}</span>}

      <div className={styles.row}>
        <svg
          viewBox={
            vertical ? `0 0 ${BOX.height} ${BOX.width}` : `0 0 ${BOX.width} ${BOX.height}`
          }
          className={styles.graphic}
          role="switch"
          tabIndex={0}
          aria-checked={index === 1}
          aria-label={def.headline ? undefined : def.label}
          aria-labelledby={def.headline ? labelId : undefined}
          onClick={toggle}
          onKeyDown={onKeyDown}
        >
          <g transform={outer}>
            <g transform={inner}>
              <rect {...BODY} className={styles.body} />
              <rect {...TAB} className={styles.tab} />
              <rect {...ROCKER_INNER} className={styles.rocker} />
              <rect {...ROCKER_OUTER} className={styles.rocker} />
            </g>
          </g>
        </svg>
      </div>

      {/* Underneath, pinned to the two ends, the way the export sets them below
          the body. Both are rendered even when empty so a switch with only one
          legend still pins it to its own end rather than centring it. */}
      {!vertical && (first?.label || second?.label) && (
        <div className={styles.endLabels}>
          <span className={styles.endLabel}>{first?.label}</span>
          <span className={styles.endLabel}>{second?.label}</span>
        </div>
      )}

      {vertical && <span className={styles.endLabel}>{second?.label}</span>}
    </div>
  )
}
