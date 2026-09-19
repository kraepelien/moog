import { SILENT } from '@audio/settings.ts'
import { isPlaceholder } from '@controls/placeholder.ts'
import { isRecalled } from '@controls/recall.ts'
import type { Registry } from '@controls/registry.ts'
import { isContinuousKnob } from '@controls/continuousKnob.ts'
import { isStepKnob } from '@controls/stepKnob.ts'
import { isTimeKnob } from '@controls/timeKnob.ts'
import { isWheel } from '@controls/wheel.ts'
import { isToggleSwitch } from '@controls/toggleSwitch.ts'
import {
  isDecoration,
  type ControlValue,
  type DecorationDef,
  type PanelItem,
} from '@controls/types.ts'
import { ContinuousKnob } from './knob/ContinuousKnob.tsx'
import { OverloadLamp } from './OverloadLamp.tsx'
import { StepKnob } from './knob/StepKnob.tsx'
import { TimeKnob } from './knob/TimeKnob.tsx'
import { ToggleSwitch } from './switch/ToggleSwitch.tsx'
import { Keyboard } from './keyboard/Keyboard.tsx'
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

function lines(label: string | readonly string[]): readonly string[] {
  return typeof label === 'string' ? [label] : label
}

/* The breaks are the panel's typography, not part of the control's name. */
function spoken(label: string | readonly string[]): string {
  return typeof label === 'string' ? label : label.join(' ')
}

/* Drawn as its shape until it has artwork. Two are exceptions: the overload
   lamp records nothing but is not inert — it reads the panel — and the keyboard
   is a drawing of forty-four keys rather than a slot. The keyboard is also the
   one item that writes to the panel as well as reading it, because a MIDI
   controller's wheels are the panel's wheels. */
function Decoration({
  item,
  values,
  setControl,
}: {
  item: DecorationDef
  values: Readonly<Record<string, ControlValue>>
  setControl: (id: string, value: ControlValue) => void
}) {
  if (item.id === 'overloadLamp') return <OverloadLamp values={values} />
  if (item.id === 'keyboard') return <Keyboard values={values} onPanelChange={setControl} />
  return (
    <div
      className={styles.slot}
      data-shape={item.shape}
      data-cap={item.cap}
      aria-hidden="true"
    />
  )
}

function Control({
  item,
  value,
  values,
  onChange,
  setControl,
  hideHeader,
}: {
  item: PanelItem
  value: ControlValue
  /* The whole panel, for the one item that is a reading of it. */
  values: Readonly<Record<string, ControlValue>>
  onChange: (value: ControlValue) => void
  /* Any control by id, for the one item that moves another. */
  setControl: (id: string, value: ControlValue) => void
  hideHeader?: boolean
}) {
  if (isDecoration(item)) {
    return <Decoration item={item} values={values} setControl={setControl} />
  }
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
  readOnly?: boolean
}

/* A section with a grid places its controls by id; one without falls back to the
   grouped rows, so a section nobody has laid out yet still draws. Controls the
   grid does not mention flow underneath it rather than vanishing — which is what
   keeps "add a knob, touch no layout" true. */
function PanelSection({ registry, section, values, onChange, readOnly }: SectionProps) {
  const layout = layoutFor(section.id)
  /* Decorations included: a jack is on the instrument, so it is on the panel. */
  const built = registry
    .itemsInSection(section.id)
    .filter((item) => isBuilt(item) || isDecoration(item))

  const draw = (item: PanelItem, captionDrawn = false) => {
    /* An empty override hides the printed label and keeps the registry's name
       for a screen reader, which cannot associate the heading it defers to. */
    const override = layout?.labels?.[item.id]
    const renamed =
      override && !isDecoration(item) ? { ...item, label: spoken(override) } : item
    const control = (
      <Control
        key={item.id}
        item={renamed}
        value={values[item.id]}
        values={values}
        onChange={frozen(item) ? () => {} : (next) => onChange(item.id, next)}
        setControl={onChange}
        hideHeader={captionDrawn || override === ''}
      />
    )
    if (!frozen(item)) return control
    /* `display: contents` so freezing costs no layout: `inert` is about the
       flat tree rather than about boxes, and the grid goes on placing the
       control itself. The no-op above is the half that holds regardless, since
       every control here is controlled by its `value` and nothing but a write
       can move one. */
    return (
      <span key={item.id} style={{ display: 'contents' }} inert>
        {control}
      </span>
    )
  }

  /* What the sheet shows as saved, against what it leaves you to play with:
     the output levels describe the room and the pitch wheel cannot hold a
     position, so neither is in the patch and neither is frozen. The keyboard
     is a decoration and is never one either. */
  const frozen = (item: PanelItem) =>
    readOnly === true && !isDecoration(item) && isRecalled(item)

  /* The section prints the caption, so the control is told not to — except a
     wheel, which carries its name underneath. */
  const captionFor = (item: PanelItem): readonly string[] | undefined => {
    const override = layout?.labels?.[item.id]
    if (override === '') return undefined
    if (override !== undefined) return lines(override)
    if (isDecoration(item)) return lines(item.label)
    if (isWheel(item)) return undefined
    if (isToggleSwitch(item)) return item.headline ? lines(item.headline) : undefined
    return lines(item.label)
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
        {section.label && <h2 className={styles.sectionLabel}>{section.label}</h2>}
      </section>
    )
  }

  const placed = placedIn(section.id)
  const loose = built.filter((item) => !placed.has(item.id))

  return (
    <section className={styles.section} data-fill={layout.fillsRow ? '' : undefined}>
      <div
        className={styles.grid}
        data-overlap={layout.knobsOverlapRows ? '' : undefined}
        style={{
          gridTemplateAreas: templateAreas(withCaptionRows(layout.rows)),
          gridTemplateColumns: `repeat(${columnCount(layout.rows)}, auto)`,
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
                >
                  {caption.map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </span>
              ),
              <div
                key={item.id}
                style={{ gridArea: item.id }}
                className={styles.cell}
                /* The switches set the pitch in a section laid out this way, so
                   the knobs are lifted out of the row's height. */
                data-overlap={
                  layout.knobsOverlapRows && !toggle && !isDecoration(item) ? '' : undefined
                }
              >
                {draw(item, !wheel)}
              </div>,
            ]
          })}
      </div>
      {loose.length > 0 && (
        <div className={styles.groupRow}>{loose.map((item) => draw(item))}</div>
      )}
      {section.label && <h2 className={styles.sectionLabel}>{section.label}</h2>}
    </section>
  )
}

export function Panel({
  registry,
  values,
  onChange,
  readOnly,
}: {
  registry: Registry
  values: Readonly<Record<string, ControlValue>>
  onChange: (id: string, value: ControlValue) => void
  /* The patch sheet at `/patch/:id` draws the same panel showing a patch as it
     was saved, so what the patch records is frozen and the rest still plays. */
  readOnly?: boolean
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
        readOnly={readOnly}
      />
    )
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelRow}>{[...row, ...rest].map(render)}</div>
      {below.length > 0 && (
        <div
          className={styles.panelRow}
          data-fill={below.some((id) => layoutFor(id)?.fillsRow) ? '' : undefined}
        >
          {below.map(render)}
        </div>
      )}
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
        {/* A control that turns, reads out and is saved, and that the sound
            here cannot answer. Said in the working view rather than left for
            somebody to discover by listening. */}
        {SILENT[item.id] && <span className={styles.note}>silent: {SILENT[item.id]}</span>}
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
    <div className={`${styles.panel} ${styles.checklist}`} data-print="off">
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
          {section.label && <h2 className={styles.sectionLabel}>{section.label}</h2>}
        </section>
      ))}
    </div>
  )
}
