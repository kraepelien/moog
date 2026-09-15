import { isPlaceholder } from '../controls/placeholder.ts'
import type { Registry } from '../controls/registry.ts'
import { isStepKnob } from '../controls/stepKnob.ts'
import { isDecoration, type ControlValue, type PanelItem } from '../controls/types.ts'
import { StepKnob } from './knob/StepKnob.tsx'
import styles from './Panel.module.css'

/* Two views of the same registry. `Panel` draws the controls that have real
   components; `PanelChecklist` draws every item on the instrument, built or not,
   so nothing can quietly go missing while controls are added one at a time.
   Neither knows the panel's contents — both read the registry. */

function isBuilt(item: PanelItem): boolean {
  return !isDecoration(item) && !isPlaceholder(item)
}

function Control({
  item,
  value,
  onChange,
}: {
  item: PanelItem
  value: ControlValue
  onChange: (value: ControlValue) => void
}) {
  if (isStepKnob(item as never) && !isDecoration(item)) {
    return (
      <StepKnob
        def={item as never}
        value={typeof value === 'string' ? value : ''}
        onChange={onChange}
      />
    )
  }
  return <span className={styles.unbuilt}>no component for “{item.id}”</span>
}

export function Panel({
  registry,
  values,
  onChange,
}: {
  registry: Registry
  values: Readonly<Record<string, ControlValue>>
  onChange: (id: string, value: ControlValue) => void
}) {
  const sections = registry.sections.filter((section) =>
    registry.itemsInSection(section.id).some(isBuilt),
  )

  if (sections.length === 0) return <p>Nothing built yet.</p>

  return (
    <div className={styles.panel}>
      {sections.map((section) => (
        <section key={section.id} className={styles.section}>
          <div className={styles.sectionBody}>
            {registry.runsInSection(section.id).map((run, index) => {
              const built = run.items.filter(isBuilt)
              if (built.length === 0) return null
              return (
                <div
                  key={run.group?.id ?? `ungrouped-${index}`}
                  className={run.group ? styles.group : styles.run}
                >
                  {run.group?.label && <h3 className={styles.groupHeader}>{run.group.label}</h3>}
                  <div className={styles.groupRow}>
                    {built.map((item) => (
                      <Control
                        key={item.id}
                        item={item}
                        value={values[item.id]}
                        onChange={(next) => onChange(item.id, next)}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <h2 className={styles.sectionLabel}>{section.label}</h2>
        </section>
      ))}
    </div>
  )
}

function ChecklistItem({ item }: { item: PanelItem }) {
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
      <div className={styles.control} data-built="">
        <div className={styles.slot} data-shape="knob" aria-hidden="true" />
        <span className={styles.label}>{item.label}</span>
        <span className={styles.scale}>built · {item.type}</span>
        <code className={styles.id}>{item.id}</code>
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

export function PanelChecklist({ registry }: { registry: Registry }) {
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
                {run.group?.label && <h3 className={styles.groupHeader}>{run.group.label}</h3>}
                <div className={styles.groupRow}>
                  {run.items.map((item) => (
                    <ChecklistItem key={item.id} item={item} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <h2 className={styles.sectionLabel}>{section.label}</h2>
        </section>
      ))}
    </div>
  )
}
