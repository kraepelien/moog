import { useEffect, useRef } from 'react'
import { KEY_COUNT, noteName } from '../../audio/notes.ts'
import { OCTAVE_DOWN, OCTAVE_UP, keyForTypedKey } from '../../audio/typing.ts'
import type { Synth } from '../../audio/engine.ts'
import { synth } from '../../audio/synth.ts'
import { useSynthSettings, useSynthState } from '../../audio/useSynth.ts'
import type { ControlValue } from '../../controls/types.ts'
import { VIEWBOX, keyboardKeys } from './keyboardArtwork.ts'
import styles from './Keyboard.module.css'

/* The instrument's keyboard, and the thing that plays it.
 *
 * It takes the panel because what a key sounds is the panel's business, and it
 * takes the instrument the way the store is taken elsewhere: a parameter with a
 * default, so a test can drive the keys against something that records instead
 * of sounding.
 *
 * Which key is down is not in a patch and not in React state above this: it is
 * held by the instrument, which has to decide note priority anyway, and pushing
 * it up would redraw sixty controls on every key.
 */
export function Keyboard({
  values = {},
  instrument = synth,
}: {
  values?: Readonly<Record<string, ControlValue>>
  instrument?: Synth
}) {
  useSynthSettings(instrument, values)
  const { held } = useSynthState(instrument)
  /* What this pointer is holding down, so dragging across the keyboard can let
     one key go as it takes the next. */
  const under = useRef<number | null>(null)

  useEffect(() => {
    const release = () => {
      if (under.current === null) return
      instrument.noteOff(under.current)
      under.current = null
    }
    /* A pointer let go anywhere counts, since a drag that leaves the keyboard
       still ends the note. Leaving the window entirely stops everything, or a
       note sustains behind a switched tab. */
    const silence = () => instrument.allOff()
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
    window.addEventListener('blur', silence)
    return () => {
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
      window.removeEventListener('blur', silence)
      instrument.allOff()
    }
  }, [instrument])

  /* The computer's keyboard plays it too, which is the only way to play two
     notes in a row quickly enough to hear what Glide and single triggering
     actually do. Held here rather than in state: a note held down must not
     redraw the panel on every repeat. */
  const typed = useRef(new Map<string, number>())
  const octaves = useRef(0)

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return
      /* Somebody naming a patch is typing words, not playing notes. */
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable]')) return
      if (event.key === OCTAVE_DOWN || event.key === OCTAVE_UP) {
        octaves.current += event.key === OCTAVE_UP ? 1 : -1
        return
      }
      const key = keyForTypedKey(event.key, octaves.current, KEY_COUNT)
      if (key === null || typed.current.has(event.key)) return
      event.preventDefault()
      typed.current.set(event.key, key)
      instrument.noteOn(key)
    }
    const up = (event: KeyboardEvent) => {
      const key = typed.current.get(event.key)
      if (key === undefined) return
      typed.current.delete(event.key)
      instrument.noteOff(key)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [instrument])

  const press = (key: number) => {
    if (under.current === key) return
    if (under.current !== null) instrument.noteOff(under.current)
    under.current = key
    instrument.noteOn(key)
  }

  return (
    <svg
      viewBox={`${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.width} ${VIEWBOX.height}`}
      className={styles.keyboard}
      role="group"
      aria-label="Keyboard"
    >
      {keyboardKeys().map((key) => (
        <rect
          key={key.index}
          x={key.x}
          y={0}
          width={key.width}
          height={key.length}
          rx={2}
          className={key.sharp ? styles.sharp : styles.natural}
          data-held={held.includes(key.index) ? '' : undefined}
          role="button"
          tabIndex={0}
          aria-label={noteName(key.index)}
          aria-pressed={held.includes(key.index)}
          onPointerDown={(event) => {
            event.preventDefault()
            press(key.index)
          }}
          /* Sounding a key the pointer arrives at rather than one it was
             pressed on is a glissando, which is a thing you do to a keyboard. */
          onPointerEnter={(event) => {
            if (event.buttons & 1) press(key.index)
          }}
          onKeyDown={(event) => {
            if (event.repeat || (event.key !== ' ' && event.key !== 'Enter')) return
            event.preventDefault()
            instrument.noteOn(key.index)
          }}
          onKeyUp={(event) => {
            if (event.key !== ' ' && event.key !== 'Enter') return
            instrument.noteOff(key.index)
          }}
        />
      ))}
    </svg>
  )
}
