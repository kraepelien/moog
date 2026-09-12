import { isPlaceholder } from '../controls/placeholder.ts'
import type { Registry } from '../controls/registry.ts'
import type { ControlDef } from '../controls/types.ts'
import styles from './Panel.module.css'

/* Renders whatever is in the registry. Adding a control to an existing section is
   a registry entry and nothing here changes; a new control type gets a branch in
   renderControl and nothing else moves. */

function Control({ def }: { def: ControlDef }) {
  if (!isPlaceholder(def)) {
    return (
      <div className={styles.control}>
        <span className={styles.label}>{def.label}</span>
        <span className={styles.unbuilt}>no component for type “{def.type}”</span>
      </div>
    )
  }

  return (
    <div className={styles.control} data-shape={def.shape}>
      <div className={styles.slot} data-shape={def.shape} aria-hidden="true" />
      <span className={styles.label}>{def.label}</span>
      {def.sheetScale && <span className={styles.scale}>{def.sheetScale}</span>}
      <code className={styles.id}>{def.id}</code>
    </div>
  )
}

export function Panel({ registry }: { registry: Registry }) {
  return (
    <div className={styles.panel}>
      {registry.sections.map((section) => (
        <section key={section.id} className={styles.section}>
          <div className={styles.sectionBody}>
            {registry.runsInSection(section.id).map((run, index) => (
              <div
                key={run.group?.id ?? `ungrouped-${index}`}
                className={run.group ? styles.group : styles.run}
              >
                {run.group?.label && <h3 className={styles.groupLabel}>{run.group.label}</h3>}
                {run.controls.map((def) => (
                  <Control key={def.id} def={def} />
                ))}
              </div>
            ))}
          </div>
          <h2 className={styles.sectionLabel}>{section.label}</h2>
        </section>
      ))}
    </div>
  )
}
