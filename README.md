# Minimoog Model D — Patch Editor

An interactive patch sheet for the Minimoog Model D. Every knob and switch on the panel holds a
value; a patch is that set of values plus a name and notes. Load factory presets, save your own
patches, and move them between machines as JSON files.

Package manager is [Bun](https://bun.com). Never npm, npx, yarn or pnpm.

```bash
bun install
bun run dev      # dev server (5173, or the next free port if a worktree already holds it)
bun run build    # typecheck + production build to dist/
bun test         # unit and lifecycle tests
bun run lint     # oxlint
```

Vite runs on Node by default. `bun --bun run dev` runs it on the Bun runtime instead — faster to
start, but not every Vite plugin is happy there, so it stays opt-in per command.

## State of play

**No control is specified yet.** The whole panel is laid out in `src/controls/panel.ts`, but every
control is a `placeholder`: no range, no positions, no default. Controls are specified one at a
time, and replacing a placeholder is a change to `type` and that type's fields on a single entry.

The placeholder codec passes stored values straight through and never reports a value invalid.
Returning its own `null` instead would let `mergeValues` write that null back over a real value
saved by a build where the control was properly defined — so reviewing the layout would quietly
damage patches.

Reported hardware values that have not been turned into specifications yet live in
`reference/control-values.md`. The recurring trap there: **the printed scale is not the range** on
at least four controls.

## Layout

```
src/
  controls/   registry.ts (generic machinery) · types.ts (contracts) · placeholder.ts · panel.ts (the panel)
  components/ Panel.tsx renders whatever the registry holds
  patch/      schema.ts (Patch + structural parse) · migrate.ts (version chain) · resolve.ts (load policy)
  storage/    types.ts (the adapter interface) · webStorage.ts (localStorage + in-memory backends)
  presets/    factory.ts (placeholder presets)
  transfer/   bundle.ts (JSON import/export)
test/         fixtures.ts defines fake control types; nothing here ships
reference/    manual scans, recovered geometry, the hand-drawn knob SVG
tools/        artwork measurement script
```

`@/` is an alias for `src/` (set in both `vite.config.ts` and `tsconfig.app.json`).

## Controls are data

A control is a registry entry, not a component. `createRegistry` validates ids, sections and types
at startup and throws on a duplicate or dangling reference. Adding a control to an existing section
is one entry in `panel.ts`; adding a new *kind* of control is a `ControlType` codec plus a
component. No layout code changes either way.

Each control type owns its whole validation policy in one `decode` returning `ok`, `coerced` or
`invalid`. That is what makes patch loading, import validation and migration generic — they never
know what a knob is.

**Control ids are permanent.** They are written into saved patches and exported files, so renaming
one breaks people's data. Treat them as a public interface.

### Not everything on the panel is a control

The registry holds one ordered list of **panel items**: controls, which hold a value, and
**decorations**, which do not. A decoration is drawn in its place on the panel and never appears in
a patch — the Overload indicator, the phones socket, the pilot lamp, and the whole of Output and
Power, whose settings say nothing about how a sound is made.

They are kept out of `registry.controls` rather than flagged inside it, so `resolvePatch`,
`defaultValues` and the patch schema need no awareness of them at all. One list rather than two,
because their order relative to controls within a section is part of the layout. Controls and
decorations share one id space, so turning one into the other later cannot collide with a name
already in use.

### Step knobs

A rotary selector that rests only on named positions. **What is stored is the position's id** —
never its printed label, never its index. A label can be re-typeset (`8'` → `8″`) and an index
shifts the moment a position is inserted; either would silently change what every saved patch
means. The octave ids carry an `ft` prefix (`ft8`, not `8`) because JavaScript hoists and reorders
integer-like object keys, which would scramble anything later keyed by position id.

A control type may implement `validateDef`, checked once when the registry is built, so a
definition that contradicts itself — a default that is not one of its own positions, a duplicate
position id — fails at startup instead of surfacing as a puzzling value at runtime.

The artwork in `src/components/knob/` is lifted **verbatim** from the hand-drawn export; only the
grouping and colour references are ours. The export is drawn turned to −15°, so rendering a
position rotates the body group by `angle − BAKED_ANGLE` and nothing is re-pathed. Ticks and
labels sit outside that group so they stay upright while the body turns, and the body is memoized
on a single number so dragging one knob does not repaint the others.

The six detent angles were read back out of the export's own spoke endpoints (−75, −45, −15, 15,
45, 75 at radius 45.5) rather than assumed, and independently match the geometry recovered from
the printed artwork in `reference/measurements.md`.

`waveforms.ts` holds the six waveform marks split out individually, each with its path and bounds,
so one can be drawn on its own — beside a knob, in a cap, or in a legend.

### Two-position switches

**A switch is not a boolean.** Several choose between two named things rather than turning one on —
Osc.3 against Filter EG, White against Pink, Osc.3 against LO. A boolean would force a label map at
every call site and a type change the day one gains a third position. So a switch is a discrete
control with exactly two positions, storing a position id like everything else.

An on/off switch is the same shape: positions `off` and `on`, where `off` carries an **empty
label** because the panel prints its legend on one side only.

Because a switch validates exactly like a step knob, that codec lives once in `discrete.ts` and
each type supplies only its name, its extra fields and its component.

A switch may carry a `headline` (printed above, centred) and each position's label prints at its
own end. The vertical variant is the horizontal one turned a quarter turn, which maps its left end
to the top — so the first position reads top and the second bottom.

The geometry is read off `BUTTON.svg`, which draws the rocker at the right-hand end; the other
export is the same switch mirrored, so the left-hand state is those shapes reflected rather than a
second copy. One set of coordinates to be wrong about, not two.

### Sections and groups

A control belongs to a section and optionally to a **group** — the boxes the patch sheet prints
inside one heading. Modifiers forces the issue: it contains two Attack/Decay/Sustain groups with
identical labels, which the section alone cannot tell apart. Groups chunk *consecutive* items
rather than collecting by id, so registry order stays authoritative.

## Patches

```jsonc
{
  "schemaVersion": 1,
  "id": "<uuid>",
  "name": "Midnight Funk",
  "notes": "",
  "values": { "<controlId>": <value> },
  "createdAt": "<ISO>",
  "updatedAt": "<ISO>"
}
```

Patches are keyed by a generated id, never by name, so renaming keeps history and two patches may
share a name.

### How a patch loads

Decided up front, because patches saved today will not have values for knobs added next week:

| Situation | Behaviour |
|---|---|
| Known control, no stored value | Registry default. Silent — the normal case while controls are added. |
| Value for an id the registry does not know | Kept in the patch verbatim, never rendered, preserved on re-save. Warned on import. |
| Right type, out of range | Clamped, and reported as coerced. |
| Undecodable value | Registry default, and reported as invalid. |
| Older `schemaVersion` | Run through the migration chain. |
| Newer `schemaVersion` | Hard fail with a clear message. Never guessed forward. |

Rendering iterates the *registry*, not the stored values, which is what makes unknown ids invisible
without anyone filtering them. `mergeValues` writes edits back without disturbing them, so an older
build cannot strip a newer build's controls.

`migrations` in `patch/migrate.ts` is keyed by the version it upgrades *from*. It is empty while
there is one version; the shape exists from the first commit so that v2 is one entry rather than a
guess at what unversioned data meant.

## Storage

```ts
interface PatchStore {
  list(): Promise<readonly PatchSummary[]>
  get(id: string): Promise<Patch | null>
  save(patch: Patch): Promise<Patch>
  delete(id: string): Promise<void>
}
```

Async throughout, even though localStorage is not. Nothing in the interface takes or returns a raw
string, and backend failures are translated to `StoreError` so no call site sees a `DOMException`.

The adapter takes its `Storage` object as a parameter rather than reaching for `window.localStorage`,
so the in-memory fallback is the same code path and the store is testable off a browser. There is no
key index — `list()` scans, which costs nothing at this size and cannot drift out of sync.

`DraftStore` is separate because the working draft has a different lifecycle: exactly one, always
overwritten, never listed, and plausibly still client-side on the day saved patches move to a server.

**What would make swapping in a backend expensive** — worth knowing before it is a surprise:

- `list()` deliberately returns summaries. If a screen ever needs values for many patches at once,
  add a purpose-built method rather than fattening the summary, or pagination becomes impossible.
- There is no optimistic concurrency. Two clients editing one patch would need a version or etag on
  `save`; `updatedAt` could serve, but nothing checks it today.
- The real risk is not the interface, it is the UI. Because localStorage answers instantly, it is
  easy to write screens with no pending or error states and only discover it when a network sits
  behind the adapter.

## Presets

Factory presets ship with the app and are read-only. They share the patch schema minus `id` and
timestamps, which belong to a stored patch. Loading one produces a fresh unsaved patch with a new
id, so saving afterwards can never write back over a preset.

The two presets in `presets/factory.ts` are obvious placeholders. Real preset data wants this shape,
with any control you have no real value for **omitted** rather than guessed — an omission falls
through to the registry default, which is honest, and a guess is not:

```jsonc
{ "slug": "midnight-funk", "name": "Midnight Funk", "notes": "", "values": { "<controlId>": <value> } }
```

## Import and export

One format, always an array:

```jsonc
{ "format": "minimoog-patch-bundle", "formatVersion": 1, "exportedAt": "<ISO>", "patches": [ … ] }
```

A single patch is the one-element case. Exporting everything as a backup is inevitable, and two
formats would mean two validators and two sets of failure modes forever. The envelope version is
separate from each patch's `schemaVersion` because the wrapper and the payload change for different
reasons, and a bundle may legitimately carry patches of mixed schema version.

A malformed envelope fails outright. A malformed patch inside a good envelope is reported and
skipped, so one bad record does not cost the rest of the file. Imported patches get fresh ids, so
importing your own export adds patches rather than silently overwriting them.

## Reference material

`reference/` and `tools/` carry over from the proof of concept. `measurements.md` holds real
geometry recovered from the manual scans with `tools/measure-artwork.py` — detent spacing, tick
angles, the palette, and the deliberate ±7-vs-±8 scale compromise. Measured, not estimated; re-run
the tool rather than guessing by eye.

`knob-export.svg` is hand-drawn. Reuse the paths verbatim and change only grouping and colour
references.

Two things learned the hard way that still apply when control components arrive:

- SVG gradient and filter ids are document-global. Shared `<defs>` in one component, not per knob,
  or they collide.
- A knob is roughly 40 SVG nodes. Memoize the component and keep its props primitive, or dragging
  one knob re-renders every other.

## Testing

`bun test` needs no extra dependencies. `localStorage` does not exist in Bun's runtime, which is
useful — it forces the storage adapter to take its backend by injection instead of reaching for a
global.

Tests live in `test/`, outside `tsconfig.app.json`'s `include`, so `bun run build` does not try to
typecheck `bun:test` imports without `@types/bun` installed. They run type-stripped and are not
typechecked; installing `@types/bun` would fix that.

`test/fixtures.ts` defines two **fake** control types. They exist to prove the registry, resolver
and importer are generic over control types. Neither is a proposal for a real Minimoog control, and
nothing in `test/` ships.
