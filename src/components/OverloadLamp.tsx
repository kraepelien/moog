import { useState } from 'react'
import { overloadGlow, overloadRiseMs } from '../controls/overload.ts'
import type { ControlValue } from '../controls/types.ts'
import styles from './OverloadLamp.module.css'

/* The one thing on the panel that reads the whole panel. Everything else draws
   its own value; this draws what the instrument would be doing. */
export function OverloadLamp({ values }: { values: Readonly<Record<string, ControlValue>> }) {
  const glow = overloadGlow(values)
  /* Which way it is going decides whose time it takes — the contour's attack
     coming up, its decay going down — so the last brightness has to be kept.
     Adjusted during render rather than in an effect, so the transition is set
     in the same paint that changes the brightness; an effect would run after
     the lamp had already started moving at the previous speed. */
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
