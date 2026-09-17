import { useState } from 'react'
import { overloadGlow, overloadRiseMs } from '@controls/overload.ts'
import type { ControlValue } from '@controls/types.ts'
import styles from './OverloadLamp.module.css'

/* The one control that draws what the instrument would be doing rather than a
   value of its own. */
export function OverloadLamp({ values }: { values: Readonly<Record<string, ControlValue>> }) {
  const glow = overloadGlow(values)
  /* Rising takes the contour's attack and falling its decay, so the previous
     brightness is kept. Adjusted in render, not an effect: an effect would set
     the duration after the lamp had started moving at the old one. */
  const [previous, setPrevious] = useState(glow)
  if (previous !== glow) setPrevious(glow)
  const ms = overloadRiseMs(values, glow > previous)

  return (
    <div
      className={styles.lamp}
      data-lit={glow > 0 ? '' : undefined}
      style={{ opacity: 0.25 + 0.75 * glow, transitionDuration: `${ms}ms` }}
      role="img"
      aria-label={glow > 0 ? 'Overload, lit' : 'Overload'}
    />
  )
}
