import { isPlaceholder } from '../controls/placeholder.ts'
import type { Registry } from '../controls/registry.ts'
import { isContinuousKnob } from '../controls/continuousKnob.ts'
import { isStepKnob } from '../controls/stepKnob.ts'
import { isTimeKnob } from '../controls/timeKnob.ts'
import { isWheel } from '../controls/wheel.ts'
import { isToggleSwitch } from '../controls/toggleSwitch.ts'
import {
  isDecoration,
  type ControlValue,
  type DecorationDef,
  type PanelItem,
} from '../controls/types.ts'
import { ContinuousKnob } from './knob/ContinuousKnob.tsx'
import { OverloadLamp } from './OverloadLamp.tsx'
import { StepKnob } from './knob/StepKnob.tsx'
import { TimeKnob } from './knob/TimeKnob.tsx'
import { ToggleSwitch } from './switch/ToggleSwitch.tsx'
import { Wheel } from './wheel/Wheel.tsx'
import {
  BELOW_PANEL,
  PANEL_ROW,
  columnCount,
  layoutFor,
  placedIn,
  templateAreas,
  withCaptionRows,
} from './panelLayout.ts'
import styles from './Panel.module.css'

/* Two views of the same registry. `Panel` draws the controls that have real
   components; `PanelChecklist` draws every item on the instrument, built or not,
   so nothing can quietly go missing while controls are added one at a time.
   Neither knows the panel's contents — both read the registry. */

function isBuilt(item: PanelItem): boolean {
  return !isDecoration(item) && !isPlaceholder(item)
}

/* A control on the instrument that a patch does not record and nothing reads:
   a socket, an indicator, the mains switch. Drawn as its shape, since that is
   all that is known about it until its artwork exists.

   The overload lamp is the exception: it records nothing, but it is not inert
   — it reads the panel. */
function Decoration({
  item,
  values,
}: {
  item: DecorationDef
  values: Readonly<Record<string, ControlValue>>
}) {
  if (item.id === 'overloadLamp') return <OverloadLamp values={values} />
  return <div className={styles.slot} data-shape={item.shape} aria-hidden="true" />
}

function Control({
  item,
  value,
  values,
  onChange,
  hideHeader,
}: {
  item: PanelItem
  value: ControlValue
  /* The whole panel, for the one item that is a reading of it. */
  values: Readonly<Record<string, ControlValue>>
  onChange: (value: ControlValue) => void
  hideHeader?: boolean
}) {
  if (isDecoration(item)) return <Decoration item={item} values={values} />
  const stored = typeof value === 'string' ? value : ''

  if (isWheel(item)) {
    return (
      <Wheel
        def={item}
        value={typeof value === 'number' ? value : item.default}
        onChange={onChange}
      />
    )
  }
  if (isTimeKnob(item)) {
    return (
      <TimeKnob
        def={item}
        value={typeof value === 'number' ? value : item.default}
        onChange={onChange}
        hideHeader={hideHeader}
      />
    )
  }
  if (isContinuousKnob(item)) {
    return (
      <ContinuousKnob
        def={item}
        value={typeof value === 'number' ? value : item.default}
        onChange={onChange}
        hideHeader={hideHeader}
      />
    )
  }
  if (isStepKnob(item)) {
    return <StepKnob def={item} value={stored} onChange={onChange} hideHeader={hideHeader} />
  }
  if (isToggleSwitch(item)) {
    return <ToggleSwitch def={item} value={stored} onChange={onChange} hideHeader={hideHeader} />
  }
  return <span className={styles.unbuilt}>no component for “{item.id}”</span>
}

interface SectionProps {
  registry: Registry
  section: { id: string; label: string }
  values: Readonly<Record<string, ControlValue>>
  onChange: (id: string, value: ControlValue) => void
}

/* A section with a grid places its controls by id; one without falls back to the
   grouped rows, so a section nobody has laid out yet still draws. Controls the
   grid does not mention flow underneath it rather than vanishing — which is what
   keeps "add a knob, touch no layout" true. */
function PanelSection({ registry, section, values, onChange }: SectionProps) {
  const layout = layoutFor(section.id)
  /* Decorations are drawn too: the jacks, lamps and the power switch are on the
     instrument, so they are on the panel. They hold no value, and none of them
     has its own artwork yet, so they come out as the shape they are. */
  const built = registry
    .itemsInSection(section.id)
    .filter((item) => isBuilt(item) || isDecoration(item))

  const draw = (item: PanelItem, captionDrawn = false) => {
    /* A printed label the panel chooses over the registry's, which stays what a
       screen reader hears. An empty one means the column heading covers it. */
    const override = layout?.labels?.[item.id]
    /* Renaming replaces the printed label; an empty one hides it and leaves the
       registry's name for a screen reader, since the heading it defers to is
       not something a screen reader can associate on its own. */
    const renamed = override && !isDecoration(item) ? { ...item, label: override } : item
    return (
      <Control
        key={item.id}
        item={renamed}
        value={values[item.id]}
        values={values}
        onChange={(next) => onChange(item.id, next)}
        hideHeader={captionDrawn || override === ''}
      />
    )
  }

  /* What the panel prints over a control. The section prints it, so the control
     is told not to — except a wheel, which carries its name underneath. */
  const captionFor = (item: PanelItem): string | undefined => {
    const override = layout?.labels?.[item.id]
    if (override === '') return undefined
    if (isDecoration(item)) return item.label
    if (isWheel(item)) return undefined
    if (isToggleSwitch(item)) return item.headline
    return override ?? item.label
  }

  if (!layout) {
    return (
      <section className={styles.section}>
        <div className={styles.sectionBody}>
          {registry.runsInSection(section.id).map((run, index) => {
            const items = run.items.filter(isBuilt)
            if (items.length === 0) return null
            return (
              <div
                key={run.group?.id ?? `ungrouped-${index}`}
                className={run.group ? styles.group : styles.run}
              >
                {run.group?.label && <h3 className={styles.groupHeader}>{run.group.label}</h3>}
                <div className={styles.groupRow}>{items.map((item) => draw(item))}</div>
              </div>
            )
          })}
        </div>
        <h2 className={styles.sectionLabel}>{section.label}</h2>
      </section>
    )
  }

  const placed = placedIn(section.id)
  const loose = built.filter((item) => !placed.has(item.id))

  return (
    <section className={styles.section}>
      <div
        className={styles.grid}
        style={{
          gridTemplateAreas: templateAreas(withCaptionRows(layout.rows)),
          gridTemplateColumns: `repeat(${columnCount(layout.rows)}, 1fr)`,
        }}
      >
        {Object.entries(layout.headings ?? {}).map(([area, lines]) => (
          <h3 key={area} style={{ gridArea: area }} className={styles.columnHeader}>
            {lines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </h3>
        ))}
        {built
          .filter((item) => placed.has(item.id))
          .flatMap((item) => {
            const caption = captionFor(item)
            const wheel = !isDecoration(item) && isWheel(item)
            const toggle = !isDecoration(item) && isToggleSwitch(item)
            return [
              caption && (
                <span
                  key={`${item.id}-cap`}
                  style={{ gridArea: `${item.id}-cap` }}
                  className={styles.caption}
                  data-for={toggle ? 'switch' : undefined}
                >
                  {caption}
                </span>
              ),
              <div key={item.id} style={{ gridArea: item.id }} className={styles.cell}>
                {draw(item, !wheel)}
              </div>,
            ]
          })}
      </div>
      {loose.length > 0 && (
        <div className={styles.groupRow}>{loose.map((item) => draw(item))}</div>
      )}
      <h2 className={styles.sectionLabel}>{section.label}</h2>
    </section>
  )
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
  const has = (id: string) =>
    registry.itemsInSection(id).some((item) => isBuilt(item) || isDecoration(item))
  const byId = new Map(registry.sections.map((section) => [section.id, section]))

  const row = PANEL_ROW.filter(has)
  /* Anything the layout does not name still appears, after the ones it does. */
  const known = new Set([...PANEL_ROW, ...BELOW_PANEL])
  const rest = registry.sections.filter((s) => !known.has(s.id) && has(s.id)).map((s) => s.id)
  const below = BELOW_PANEL.filter(has)

  if (row.length + below.length + rest.length === 0) return <p>Nothing built yet.</p>

  const render = (id: string) => {
    const section = byId.get(id)
    if (!section) return null
    return (
      <PanelSection
        key={id}
        registry={registry}
        section={section}
        values={values}
        onChange={onChange}
      />
    )
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelRow}>{[...row, ...rest].map(render)}</div>
      {below.length > 0 && <div className={styles.panelRow}>{below.map(render)}</div>}
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
