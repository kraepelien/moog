import {
  isDecoration,
  type ControlDef,
  type ControlType,
  type ControlValue,
  type DecorationDef,
  type GroupDef,
  type PanelItem,
  type SectionDef,
} from './types.ts'

/* Control ids travel in saved patches and exported files, so they are a public
   interface: permissive enough not to dictate a naming convention, strict enough
   that an id is always a safe JSON key. */
const ID_PATTERN = /^[A-Za-z0-9_-]+$/

export interface RegistryInput {
  readonly types: readonly ControlType<never, never>[]
  readonly sections: readonly SectionDef[]
  readonly groups?: readonly GroupDef[]
  /* Everything on the panel, in the order it is drawn: controls and decorations
     interleaved. One list rather than two, because their relative order within a
     section is part of the layout and two lists cannot express it. */
  readonly items: readonly PanelItem[]
}

/* One run of consecutive items that share a group, in registry order. Chunking on
   the run rather than collecting by group id keeps source order authoritative: a
   section reads top to bottom exactly as it is written. */
export interface ItemRun {
  readonly group: GroupDef | null
  readonly items: readonly PanelItem[]
}

export interface Registry {
  readonly sections: readonly SectionDef[]
  readonly groups: readonly GroupDef[]
  /* Everything drawn. */
  readonly items: readonly PanelItem[]
  /* Only what holds a value, and so only what a patch ever contains. */
  readonly controls: readonly ControlDef[]
  readonly decorations: readonly DecorationDef[]
  readonly controlIds: readonly string[]
  control(id: string): ControlDef | undefined
  controlType(def: ControlDef): ControlType
  itemsInSection(sectionId: string): readonly PanelItem[]
  runsInSection(sectionId: string): readonly ItemRun[]
}

/* Throws rather than returning a Result: a malformed registry is a programming
   error that should never reach a running app, and the only callers are module
   initialisation and tests. */
export function createRegistry(input: RegistryInput): Registry {
  const types = new Map<string, ControlType>()
  for (const type of input.types as readonly ControlType[]) {
    if (types.has(type.type)) throw new Error(`Duplicate control type "${type.type}"`)
    types.set(type.type, type)
  }

  const sections = new Map<string, SectionDef>()
  for (const section of input.sections) {
    if (!ID_PATTERN.test(section.id)) throw new Error(`Invalid section id "${section.id}"`)
    if (sections.has(section.id)) throw new Error(`Duplicate section id "${section.id}"`)
    sections.set(section.id, section)
  }

  const groupList = input.groups ?? []
  const groups = new Map<string, GroupDef>()
  for (const group of groupList) {
    if (!ID_PATTERN.test(group.id)) throw new Error(`Invalid group id "${group.id}"`)
    if (groups.has(group.id)) throw new Error(`Duplicate group id "${group.id}"`)
    if (!sections.has(group.section)) {
      throw new Error(`Group "${group.id}" is in unknown section "${group.section}"`)
    }
    groups.set(group.id, group)
  }

  const seen = new Map<string, PanelItem>()
  const controls: ControlDef[] = []
  const decorations: DecorationDef[] = []
  const bySection = new Map<string, PanelItem[]>()
  for (const section of input.sections) bySection.set(section.id, [])

  for (const item of input.items) {
    if (!ID_PATTERN.test(item.id)) throw new Error(`Invalid panel item id "${item.id}"`)
    /* Ids are shared across controls and decorations so that turning one into the
       other can never collide with something already using the name. */
    if (seen.has(item.id)) throw new Error(`Duplicate panel item id "${item.id}"`)
    const section = bySection.get(item.section)
    if (!section) throw new Error(`Panel item "${item.id}" is in unknown section "${item.section}"`)
    if (item.group !== undefined) {
      const group = groups.get(item.group)
      if (!group) throw new Error(`Panel item "${item.id}" is in unknown group "${item.group}"`)
      if (group.section !== item.section) {
        throw new Error(
          `Panel item "${item.id}" is in section "${item.section}" but group "${item.group}" belongs to "${group.section}"`,
        )
      }
    }

    if (isDecoration(item)) {
      decorations.push(item)
    } else {
      if (!types.has(item.type)) {
        throw new Error(`Control "${item.id}" has unregistered type "${item.type}"`)
      }
      controls.push(item)
    }

    seen.set(item.id, item)
    section.push(item)
  }

  const runsBySection = new Map<string, ItemRun[]>()
  for (const [sectionId, items] of bySection) {
    const runs: ItemRun[] = []
    for (const item of items) {
      const last = runs.at(-1)
      if (last && (last.group?.id ?? undefined) === item.group) {
        ;(last.items as PanelItem[]).push(item)
      } else {
        runs.push({ group: item.group ? groups.get(item.group)! : null, items: [item] })
      }
    }
    runsBySection.set(sectionId, runs)
  }

  const controlsById = new Map(controls.map((def) => [def.id, def]))

  return {
    sections: input.sections,
    groups: groupList,
    items: input.items,
    controls,
    decorations,
    controlIds: controls.map((d) => d.id),
    control: (id) => controlsById.get(id),
    controlType: (def) => {
      const type = types.get(def.type)
      if (!type) throw new Error(`Control "${def.id}" has unregistered type "${def.type}"`)
      return type
    },
    itemsInSection: (sectionId) => bySection.get(sectionId) ?? [],
    runsInSection: (sectionId) => runsBySection.get(sectionId) ?? [],
  }
}

export function defaultValues(registry: Registry): Record<string, ControlValue> {
  const values: Record<string, ControlValue> = {}
  for (const def of registry.controls) {
    values[def.id] = registry.controlType(def).defaultValue(def)
  }
  return values
}
