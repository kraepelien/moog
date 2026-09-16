import { VIEWBOX, keyboardKeys } from './keyboardArtwork.ts'
import styles from './Keyboard.module.css'

/* The instrument's keyboard, drawn rather than wired. Nothing here makes a
   sound and a patch records nothing a key would set, so it plays nothing; it is
   on the panel because it is the rest of the instrument's front, and the
   performance strip stands at the left end of it. */
export function Keyboard() {
  return (
    <svg
      viewBox={`${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.width} ${VIEWBOX.height}`}
      className={styles.keyboard}
      aria-hidden="true"
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
        />
      ))}
    </svg>
  )
}
