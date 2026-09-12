import type { ControlDef, ControlType, ControlValue, GroupDef, SectionDef } from './types.ts'

/* Control ids travel in saved patches and exported files, so they are a public
   interface: permissive enough not to dictate a naming convention, strict enough
   that an id is always a safe JSON key. */
const ID_PATTERN = /^[A-Za-z0-9_-]+$/

export interface RegistryInput {
  readonly types: readonly ControlType<never, never>[]
  readonly sections: readonly SectionDef[]
  readonly groups?: readonly GroupDef[]
  readonly controls: readonly ControlDef[]
}

/* One run of consecutive controls that share a group, in registry order. Chunking
   on the run rather than collecting by group id keeps source order authoritative:
   a section reads top to bottom exactly as it is written. */
export interface ControlRun {
  readonly group: GroupDef | null
  readonly controls: readonly ControlDef[]
}

export interface Registry {
  readonly sections: readonly SectionDef[]
  readonly groups: readonly GroupDef[]
  readonly controls: readonly ControlDef[]
  readonly controlIds: readonly string[]
  control(id: string): ControlDef | undefined
  controlType(def: ControlDef): ControlType
  controlsInSection(sectionId: string): readonly ControlDef[]
  runsInSection(sectionId: string): readonly ControlRun[]
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

  const controls = new Map<string, ControlDef>()
  const bySection = new Map<string, ControlDef[]>()
  for (const section of input.sections) bySection.set(section.id, [])

  for (const def of input.controls) {
    if (!ID_PATTERN.test(def.id)) throw new Error(`Invalid control id "${def.id}"`)
    if (controls.has(def.id)) throw new Error(`Duplicate control id "${def.id}"`)
    if (!types.has(def.type)) throw new Error(`Control "${def.id}" has unregistered type "${def.type}"`)
    const section = bySection.get(def.section)
    if (!section) throw new Error(`Control "${def.id}" is in unknown section "${def.section}"`)
    if (def.group !== undefined) {
      const group = groups.get(def.group)
      if (!group) throw new Error(`Control "${def.id}" is in unknown group "${def.group}"`)
      if (group.section !== def.section) {
        throw new Error(
          `Control "${def.id}" is in section "${def.section}" but group "${def.group}" belongs to "${group.section}"`,
        )
      }
    }
    controls.set(def.id, def)
    section.push(def)
  }

  const runsBySection = new Map<string, ControlRun[]>()
  for (const [sectionId, defs] of bySection) {
    const runs: ControlRun[] = []
    for (const def of defs) {
      const last = runs.at(-1)
      if (last && (last.group?.id ?? undefined) === def.group) {
        ;(last.controls as ControlDef[]).push(def)
      } else {
        runs.push({ group: def.group ? groups.get(def.group)! : null, controls: [def] })
      }
    }
    runsBySection.set(sectionId, runs)
  }

  return {
    sections: input.sections,
    groups: groupList,
    controls: input.controls,
    controlIds: input.controls.map((d) => d.id),
    control: (id) => controls.get(id),
    controlType: (def) => {
      const type = types.get(def.type)
      if (!type) throw new Error(`Control "${def.id}" has unregistered type "${def.type}"`)
      return type
    },
    controlsInSection: (sectionId) => bySection.get(sectionId) ?? [],
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
