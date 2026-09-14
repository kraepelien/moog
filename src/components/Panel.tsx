import { isPlaceholder } from '../controls/placeholder.ts'
import type { Registry } from '../controls/registry.ts'
import { isDecoration, type PanelItem } from '../controls/types.ts'
import styles from './Panel.module.css'

/* Renders whatever is in the registry. Adding a control to an existing section is
   a registry entry and nothing here changes; a new control type gets a branch in
   Item and nothing else moves. */

function Item({ item }: { item: PanelItem }) {
  if (isDecoration(item)) {
    return (
      <div className={styles.control} data-decoration="">
        <div className={styles.slot} data-shape={item.shape} aria-hidden="true" />
        <span className={styles.label}>{item.label}</span>
        <span className={styles.scale}>no value</span>
        {item.note && <span className={styles.note}>{item.note}</span>}
      </div>
    )
  }

  if (!isPlaceholder(item)) {
    return (
      <div className={styles.control}>
        <span className={styles.label}>{item.label}</span>
        <span className={styles.unbuilt}>no component for type “{item.type}”</span>
      </div>
    )
  }

  return (
    <div className={styles.control}>
      <div className={styles.slot} data-shape={item.shape} aria-hidden="true" />
      <span className={styles.label}>{item.label}</span>
      {item.sheetScale && <span className={styles.scale}>{item.sheetScale}</span>}
      <code className={styles.id}>{item.id}</code>
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
                {run.items.map((item) => (
                  <Item key={item.id} item={item} />
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
