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

**All 43 controls are specified and built**, plus 8 decorations that are drawn but hold no value.
Five control types cover the instrument: step knob, two-position switch, continuous knob, time knob
and wheel.

**The keyboard plays.** Every control drives the sound: three oscillators, the mixer with noise,
the filter with its contour, both envelopes, glide, the modulation bus and both wheels. See
"Making a sound" below for what is modelled and what is not.

The `placeholder` type stays registered even though nothing uses it. It is how every control here
arrived: laid out on the panel so the layout could be checked, before anything was specified. Its
codec passes stored values straight through and never reports one invalid, so a placeholder can
neither invent a value nor destroy one a later build understands.

Hardware values reported to us live in `reference/control-values.md`. The recurring trap there:
**the printed scale is not the range** on four controls.

## Layout

```
src/
  controls/   registry.ts (generic machinery) · types.ts (contracts) · placeholder.ts · panel.ts (the panel)
  components/ Panel.tsx renders whatever the registry holds
  components/library/ the patch library: search, filter chips, rows, the patch header
  patch/      schema.ts (Patch + structural parse) · migrate.ts (version chain) · resolve.ts (load policy)
  storage/    types.ts (the adapter interface) · webStorage.ts (localStorage + in-memory backends)
  presets/    factory.ts (placeholder presets)
  transfer/   bundle.ts (JSON import/export)
  audio/      calibration.ts (every dial-to-physical number) · settings.ts (the panel read as
              an instrument) · engine.ts (the Web Audio graph)
test/         fixtures.ts defines fake control types; nothing here ships
reference/    manual scans, recovered geometry, the hand-drawn knob SVG
tools/        artwork measurement script · audio-check.html (what the engine sounds like)
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

### Continuous knobs

Stored as a **number in the control's own printed units** — a cutoff of −1.5 is stored as `-1.5`,
not as a fraction of travel. Normalising to 0…1 would mean that changing a range later silently
remaps every saved patch, and it would make the JSON unreadable in a format people send each other.
Real units mean a narrowed range *clamps* instead, which is the right failure: a patch saved at
maximum stays at maximum rather than jumping to the middle.

**The printed scale is not the range.** Several of these travel further than the silkscreen admits —
Tune prints to 2 but reaches 2.5, the oscillator frequency knobs print to 7 but reach 8, Cutoff
prints to 4 but reaches 5. So `scale` (what is drawn) is given separately from `min`/`max` (what is
storable), and `validateDef` rejects a scale that runs outside the range.

Where the range runs past the printed scale, the end gets an **unlabelled tick** so the extra travel
is visible. Without it a knob that reaches 8 while printing to 7 looks like it stops at 7, and the
extra travel reads as a bug rather than as the instrument.

`step` is separate again: it is what one nudge changes and what stored values round to. Every
continuous control on the panel **stores to a hundredth and prints a tenth**, so a value set by
dragging keeps the precision it was given while the panel stays readable. Nothing here steps in
whole units — the controls with set values are the rotary selectors and the switches, which are
discrete types rather than knobs with a step of 1. Values are re-rounded on every change, because
adding 0.01 a hundred times does not give 1 in binary floating point.

**Double click a control to set it directly**, which leaves single click and drag free to turn it.
What appears depends on the kind of control:

- A control with a **range** gets a box to type in. Enter and blur commit, Escape abandons, and text
  that does not parse abandons too — quietly substituting a default would look like the control
  ignored you. On a time knob a bare number is milliseconds, the unit it stores; seconds have to be
  said (`1.5s`), so `1.5` cannot silently mean a second and a half.
- A control with **named positions** gets a list to pick from. There is nothing to type that
  choosing does not say better, and typing made the parser guess what `tri` meant. A native
  `<select>`, so a phone gives its own picker and keyboard and screen-reader behaviour come free.

## Typeface

Roboto Condensed, self-hosted through `@fontsource-variable/roboto-condensed` rather than fetched
from a CDN: nothing external at runtime, so it works offline and never renders in a fallback face
while a third party responds. One file carries the whole 100–900 weight axis. Only the upright
faces are imported; the package's `index.css` also pulls italic, which nothing here uses.

SVG text does not inherit `font-family` from `:root` the way HTML does, so `svg { font-family:
inherit }` carries it into the dials and switch legends.

### Wheels

Continuous like a knob but travelling up and down, and with no printed numerals — the panel shows
only the ribbed wheel and its marker. The ribs are the wheel's surface and never move; the marker
is the only thing a value changes.

Pitch is **sprung**, recorded as `springsTo` rather than assumed: the real wheel is centre-returning
and cannot hold a position once your hand leaves it, so releasing a drag returns it. That is guarded
on a drag having actually started, so a stray pointer-up over the wheel cannot discard a value set
from the keyboard.

Both exports share one tick geometry — centre (53, 65), spokes to radius 39 every 30° from −150 to
+150, a 300° sweep — and differ only in body size and indicator radius, so `size: 'small' | 'large'`
picks between them. Each was exported turned to a particular angle, recorded as `bakedAngle`, so
rendering rotates by `angle − bakedAngle` and no path is redrawn.

### Time knobs (Attack and Decay)

The one control whose printed scale is not proportional to its travel: the marks are evenly spaced
around the dial while their values are not. The first half of the turn covers 0 to 800 ms, the
second covers 1 to 30 seconds.

**Stored in milliseconds.** A real quantity, so it keeps its meaning if the dial is ever redrawn and
it reads plainly in an exported patch. A fraction of travel would mean the number in the file only
made sense against the version of the table that produced it.

**Stepping is by fraction of travel, not by a fixed number of milliseconds.** That is forced by the
scale: 10 ms is an enormous jump at the bottom and invisible at the top. A nudge is 1/120 of the
sweep, and landing within half a nudge of a printed mark snaps exactly onto it so the marked values
stay reachable from the keyboard.

Each control carries its own table, so Attack and Decay can diverge — they reportedly differ
slightly despite identical markings — without touching anything else.

The even spacing is what puts 800 ms at exactly half travel, which is how the knob was described to
us independently; there is a test pinning that.

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

## The library and the patch header

Two views, switched in the top bar: the editor is the panel, the library is
everything saved. `src/components/library/` holds both the library and the bar
the editor prints above the panel, because they are drawn from the same fields.

A `LibraryEntry` is what one line needs, and it is deliberately not a `Patch`.
Presets arrive whole from `listPresets`; saved patches arrive as `PatchSummary`,
which carries `tags`, `instrument` and `visibility` alongside the name and its
timestamps so that both sources supply the same fields and every line draws the
same chips.

Those three are in the summary because they are **metadata, not values**. The
warning further down about not fattening the summary is about `values`: pulling
the control settings for every patch is what would make paginating expensive.
Three short fields that let a list be drawn without fetching each patch are the
opposite trade. `approximate` stays out, because it is a claim about values the
list does not carry.

**Chip colour is assigned, not meaningful.** Tags are plain strings an admin can
add to and retire, so a hand-kept colour map would leave new tags grey and dead
entries behind. `toneForTag` hashes the tag instead, which gives it one colour
everywhere it appears without anyone choosing it. The colour is there to tell
chips apart at a glance, nothing more.

Within a filter row the chips are an OR and the rows are an AND, so "bass or
lead, on a Model D" is sayable. An empty row filters nothing rather than matching
nothing, or opening the library would show an empty list.

Opening a row loads the patch and switches to the editor in one go. A factory
preset opens as a **copy**, so saving afterwards cannot write back over it; a
patch of your own opens as itself, so saving updates the one you picked.

MUI is wrapped in `StyledEngineProvider injectFirst` in `main.tsx`. Without it
MUI's own single-class rules for things like `display` and `border-radius` are
injected after ours and win on order alone, which makes a component's
`.module.css` a suggestion rather than a rule.

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

## Making a sound

The panel stores what the silkscreen says: a knob at 7 stores 7. Sounding it needs hertz, seconds
and gains, and `reference/` supplies almost none of them. It gives geometry, the ranges behind four
printed scales, and one table of contour times. It states no cutoff frequency, no glide time, no LFO
rate and no oscillator interval.

So **every dial-to-physical number lives in `audio/calibration.ts`, with its source**: `printed`
(the panel says so, which is true of exactly one number, A-440), `measured`, `reported`, or
`derived` with the reasoning written out. A test enforces it — anything not marked `derived` must
cite a path under `reference/`. That file is also the tuning bench: nothing else may write a number,
so every adjustment made by ear is one edit in one place.

`audio/settings.ts` reads the panel into physical quantities and is pure, total, and panel-only. It
holds no note, because pitch is a function of the panel *and* a key, and a description that changed
on every key press could not be diffed to find what a knob did.

`audio/engine.ts` owns the graph. The rule that shapes it: cutoff and pitch are each wanted by
several things at once, so the panel's static reading goes on `frequency` and everything summed or
moving goes on `detune`, in cents. Keyboard tracking is then a plain gain on a voltage already in
cents, and glide is one ramp on the one node every oscillator reads, which is what the instrument's
single keyboard voltage is. Nothing is built per note: oscillators cannot be restarted, so they run
for the life of the context and the contours gate them.

### What is not modelled

- **The filter is two cascaded biquads, not a ladder.** Four poles and resonance, but it will not
  self-oscillate at Emphasis 10 and the resonance is thinner than the real thing's. The seam for an
  AudioWorklet ladder is the filter section of `engine.ts` and nothing else.
- **The external input** has no jack to plug into, and **Phones Volume** has no second bus. Both are
  listed in `SILENT` with their reason, surfaced in the checklist, and a test moves each through its
  whole travel to prove the sound does not change.
- **The mixer does not overdrive.** The instrument's does, audibly; this divides by its own source
  count instead of clipping.

### Hearing it

`tools/audio-check.html` answers what no unit test can. Run `bun run dev`, open
`/tools/audio-check.html`, and it renders the engine through an `OfflineAudioContext` and prints
what came out. Read `a4` against `a440Switch` first: the same pitch reached two ways, so if they
disagree the keyboard is in the wrong octave.

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
