# PatchDB

An interactive patch sheet for the Minimoog Model D. Every knob and switch on the panel holds a
value; a patch is that set of values plus a name and notes. Load the factory patches, save your own
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

**All 47 controls are specified and built**, plus 5 decorations that are drawn but hold no value.
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
  components/ Panel.tsx renders whatever the registry holds · PageNav.tsx (the navigation, down
              the left or across the top) · navPlacement.ts (which of the two)
  components/library/ the patch library: search, filter chips, rows, the patch header
  patch/      schema.ts (Patch + structural parse) · migrate.ts (version chain) · resolve.ts (load
              policy) · copy.ts (copying anything you may not write over)
  access/     privileges.ts (the vocabulary and the one resolve()) · Can.tsx (the guards)
  admin/      UsersPage.tsx (everyone with an account) · UserAccess.tsx (one person's privileges)
  components/midi/ the MIDI desk: a file, a sound per part, and saving the two together
  navigation/ routes.ts (the page table) · router.ts (the address)
  storage/    types.ts (the adapter interface) · httpStore.ts (the API) · deviceSkin.ts (the colour
              preview) · deviceRail.ts (whether the rail is folded) · deviceNav.ts (whether the
              menu was asked to stay on top)
  transfer/   bundle.ts (JSON import/export)
  audio/      calibration.ts (every dial-to-physical number) · settings.ts (the panel read as
              an instrument) · engine.ts (the Web Audio graph)
server/
  repositories/ the SQL, one module per table group; rows in, rows out
  services/     the rules — who may write a patch, what a tag may be called
  routes/       table.ts (the dispatcher and its guard) · one module per resource
  api.ts        wiring: origin, viewer, rate limit, dispatch
bank/         the factory patches, one JSON file each, seeded into the database on a first start
test/         fixtures.ts defines fake control types; nothing here ships
reference/    manual scans, recovered geometry, the hand-drawn exports in artwork/, the rail's
              drawings, the mark and the icons
tools/        artwork measurement script · make-icons.ts (public/'s icons) · audio-check.html
              (what the engine sounds like) · midi-check.html and midi-send.html (see MIDI.md)
```

Each of those directories has an import alias — `@patch/schema.ts`, `@controls/registry.ts`,
`@server/store.ts` — with `@/` for the few files directly in `src/`, and siblings left relative.
`tsconfig.paths.json` holds the map, and holds it once: the tsconfigs extend it, `vite.config.ts`
reads it, `test/image.test.ts` walks it. Specifiers keep their `.ts`, which `server/` requires and
the rest follow. `AGENTS.md` has the reasons, and they are sharper than they look.

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
a patch — the Overload indicator, the phones socket, the keyboard, and the whole of Power, whose
pilot lamp and switch say nothing about how a sound is made.

Output is not among them, although it sits beside Power and reads like it should be: Volume, Main
Output and A-440 are controls that a patch stores, and only the phones socket drawn next to them is
a decoration.

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

Two views, switched in the nav: the editor is the panel, the library is
everything saved. `src/components/library/` holds both the library and the bar
the editor prints above the panel, because they are drawn from the same fields.

A `LibraryEntry` is what one line needs, and it is deliberately not a `Patch`.
It carries `tags`, `instrument` and `visibility` alongside the name and its
timestamps, so a line draws its chips without anything fetching values — and it
is assembled on the server, because the ratings on it are.

Those three are in the summary because they are **metadata, not values**. The
warning further down about not fattening the summary is about `values`: pulling
the control settings for every patch is what would make paginating expensive.
Three short fields that let a list be drawn without fetching each patch are the
opposite trade. `approximate` stays out, because it is a claim about values the
list does not carry.

**A tag's colour is assigned unless somebody assigns it.** Tags are plain
strings an admin can add to and retire, so a colour map that had to be kept by
hand would leave new tags grey and dead entries behind. `toneForTag` hashes the
name instead, which gives every tag one colour everywhere it appears without
anyone choosing it, and the colour is there to tell chips apart at a glance and
nothing more.

An admin who *does* want to choose picks one on the Tags page, and it is stored
on the row rather than in a map: deleting the tag takes the colour with it,
where a map would keep a colour for a name nothing wears. One hex, not two — the
lettering is the colour and the chip behind it is a `color-mix` of the same,
which is why there is no pair that can be set to disagree. A patch stores the
tag's *name* and points at no row, so a tag the list has since forgotten falls
back to the hash and still draws.

**The picker opens on the colour the tag is wearing**, hashed or chosen. It has
to: a field showing one colour beside a chip drawn in another reads as the page
having lost track of which is which. A hash names a *tone*, and a tone is a
custom property an `<input type="color">` cannot parse, so the hex comes from
`skinValue` — the skin's answer, or the stylesheet's — which is the same helper
the Layout page seeds its own fields from and moves with a repainted tone rather
than going stale against it. Clear is then the only thing saying whether a
colour was chosen or worked out, which is what it is disabled for.

**The Other row is the opposite**, because it is a closed set of three the code
owns and the colour is the distinction: Factory red, User blue, Custom purple.
Red is kept out of the tag rotation, but only because adding a sixth tone
repoints the hash and recolours every tag already in use. A tag can still come
out blue or purple; what tells it from a bank is the column it sits in, which is
why the row is a grid of fixed cells rather than one run of chips.

**A bank is not a field on the patch.** `origin` is the store a patch came from,
`factory` or `user`, and it says the same thing to everybody. The bank is
`bankOf`: a factory patch is Factory, and a saved one is User to whoever saved it and
Custom to everyone else — so two people open the same library and one row reads
differently to each of them. That is the distinction worth browsing by, and it
is free, because the server already sends `mine` per viewer to draw your own
rating in blue. Blue means you in both places.

Public sits in that row without being a bank: a patch is one of the three and may
*also* be published, so it toggles a flag of its own and takes amber, the tone the
three banks leave free.

Within a filter row the chips are an OR and the rows are an AND, so "bass or
lead, on a Model D" is sayable. An empty row filters nothing rather than matching
nothing, or opening the library would show an empty list.

**Order is a fourth row and a choice of one.** Name, Rating, Updated, each
carrying the one direction anybody wants of it, so there is no second control
for ascending against descending. Pressing the chip already on does nothing:
the row has no off state to fall to. It wears a single tone, because the three
are a closed set whose words are the distinction. Name is the order the rows
arrive in, `order by p.name collate nocase` from the server, so the chip
re-sorts nothing; the others break their ties on recency and then name.

The order is held beside the filters rather than inside them, since an order is
not a filter and folding it in would leave "clear the filters" with two things
it could mean. And it is applied to the whole list before a page is sliced out
of it: ordering the visible page instead would rank a hundred rows against each
other and leave the best of the bank sitting on page two.

**Rating means what the home shelf means by best.** `scoreOf` in
`components/library/entry.ts` is the one definition, read by both: every patch
is scored as though it already carried three imagined middling ratings, so one
delighted rating cannot beat what a crowd settled high, and unrated sits at the
middle rather than last. It lives in the library's own file rather than beside
the shelf that first wanted it, so the two cannot drift apart.

The search box covers names, categories and synths, and says only that. Stars
are deliberately not searchable: a bare `4` would also match every patch whose
name carries a digit, and there are three of those in the bank, so the list
would jump for a reason nobody could see. A `stars:` prefix would be a query
language for one field. The Order row is the honest answer to caring about
ratings.

Opening a row goes to that patch's own address, `/patch/:id`, which is the one
page in the app with an address per thing it shows. See **The patch sheet**.

Saving is a form, not a button. **Save** opens `SavePatchDialog`, which collects
the name, the categories, the synth, whether it is public, and the notes, then
hands them back as `PatchFields` — deliberately not a `Patch`, because what
saving *means* (created, or written over) belongs to whoever owns the store, not
to a form.

The form refills itself as it renders rather than in an effect, comparing the
patch it was last filled from against the one it is open on. An effect would
paint the previous edit for a frame first, and the comparison is also what makes
a second opening of the *same* patch forget what an abandoned first one typed.

**There is no factory chip**: which bank a patch belongs to is the server's to
decide and the write routes for it do not exist, so the row shows the one that
applies and offers only Public. Nor a Custom one — you are saving into your own
name, so the locked chip is always User.

### Categories are a list an admin keeps

The `tags` table holds the vocabulary the save form offers, seeded with twelve
in `server/services/tags.ts`. A patch still stores the name as a plain string pointing at
nothing, so retiring a row leaves every patch already wearing it exactly as it
was, and an exported patch still means something on a machine that has never
heard of the table.

**Seeded once, not synced** — the opposite of instruments. Instruments are code,
so the image is the authority and re-asserting them on every start is right.
Categories are editorial, and re-asserting them would undo a deletion at the next
restart, which would make an admin page look broken. `seedTags` writes only into
an empty table.

The form offers this list rather than the tags patches happen to wear, or a bank
nothing is tagged in yet could never be given its first one. The library's filter
chips still come from what is actually in the library, so no filter is offered
that can only return nothing.

MUI is wrapped in `StyledEngineProvider injectFirst` in `main.tsx`. Without it
MUI's own single-class rules for things like `display` and `border-radius` are
injected after ours and win on order alone, which makes a component's
`.module.css` a suggestion rather than a rule.

## The app's colours

`src/shellPalette.css` declares every colour the chrome draws with as a custom property on `:root`,
and `src/tones.ts` hands out `var()` references rather than values. Nothing else changes: MUI's
theme, the CSS modules and the inline `sx` colours all read the same properties, so repainting the
app is one write per colour with no re-render and no component knowing a skin exists.

Every wash and every switched-on chip is a `color-mix` of an ink, so those are not declared and
cannot drift — and a tag coloured by an admin gets the same three shades from `shadesOf` without a
custom property existing for it. The status and input **edges** are the exception and are declared,
because an edge mixed out of its own fill cannot be tried on its own, and trying them is the point
of having them.

One property per colour, which is occasionally a colour wearing two names. Red, amber and green have
no property of their own: they are `--shell-error`, `--shell-warning` and `--shell-success`, because
the Factory chip and something having gone wrong are the same red said twice, and two pickers for it
is how they stop agreeing. `TONE_INK` in `tones.ts` is where a tone says which property holds it, and
`TONE_SWATCH` is how anything asks — `toneForTag` answers with a tone, and a tone is no longer also a
skin key.

A swatch marked **`pending`** is declared and settable and nothing reads it yet. The Layout page says
so in the field, because a picker that repaints nothing is otherwise a picker that looks broken, and
`test/skin.test.ts` fails if the flag is wrong in either direction — so pointing a surface at one of
these properties is two edits, not one. The same test fails on a `var()` naming a property no
stylesheet declares, which is the quiet half of a rename: it draws as though the rule were never
written.

A skin is **partial**: a key it leaves out is the stylesheet's value, so adding a colour to
`SKIN_SWATCHES` never needs a migration, and choosing the default is *removing* the key rather than
storing it. It is sifted by `cleanSkin` on the way in, because a value that is not a hex is a way of
writing CSS into the page.

**MUI's palette is the tones, under MUI's own names.** `primary`, `secondary`, `error`, `warning`,
`success` and `info` are handed a `var()` apiece in `theme.ts`, because a component reaches for those
rather than for a tone: a focused field, a checkbox, the tab indicator, the pager and anything
`color="error"` were all drawing MUI's defaults, which no skin could reach. Nothing new is declared —
each one is a tone that already has a swatch. `contrastText` is given rather than left to MUI, which
derives it by *reading* `main`, and `main` here is a property it cannot read.

The lettering *on* a filled tone is its own colour, `--shell-on-tone`. A near-black hand-tinted per
tone would be four literals in three components, and a skin that lightened a tone would leave every
one of them unreadable with nothing to set.

### The hexes are the product; the page is a preview

The colours the app ships with are the hexes in `shellPalette.css` and `DEFAULT_SKIN`, and changing
one is a commit. There is no server-side skin: nothing an admin does in the browser repaints the app
for anybody else, and there is no `/api/skin`.

What the Layout page does is **try colours out**. `storage/deviceSkin.ts` keeps them in
`sessionStorage` — on that browser, for that tab — and `main.tsx` reads them synchronously and paints
them **before the first render**, so there is no round trip and no frame in which the defaults flash
past. The adapter takes its `Storage` as a parameter rather than reaching for `window`, because Bun's
runtime has none and that is what makes it testable.

The page has no preview pane, because the preview is the app: every field writes straight onto
`:root`, so the bar, the cards, the chips and the text under the cursor all move as the picker moves,
and they stay moved when you walk to the library or the editor. `PreviewBanner` in the chrome is what
says so — a repaint with no visible cause and no visible way out is the failure it exists to prevent.

Its **Export** button turns the difference from the shipped defaults into a prompt (`exportPrompt.ts`)
naming each changed colour, its custom property, and both files that hold the defaults. You paste it
into a Claude Code session, which makes the change in source and opens a pull request. The prompt
names both files because `test/skin.test.ts` fails if they disagree, and `test/exportPrompt.test.ts`
reads them off disk so the wording cannot drift from the files it names.

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

Three oscillators that agreed exactly would be a wrong model rather than a quiet one: summed dead
in phase they give one louder oscillator where three real ones give a thick one. So Oscillator-2 and
Oscillator-3 sit a few cents off Oscillator-1, which has no frequency knob precisely because it is
what they are tuned against, and all three wander slowly. Both numbers are `derived`, and both are
why the panel's A-440 switch has something to be a reference *for*.

### What is not modelled

- **The filter is two cascaded biquads, not a ladder.** Four poles and resonance, but it will not
  self-oscillate at Emphasis 10 and the resonance is thinner than the real thing's. The seam for an
  AudioWorklet ladder is the filter section of `engine.ts` and nothing else.
- **The external input** has no jack to plug into, and **Phones Volume** has no second bus. Both are
  listed in `SILENT` with their reason, surfaced in the checklist, and a test moves each through its
  whole travel to prove the sound does not change.
- **The mixer does not overdrive.** The instrument's does, audibly; this divides by its own source
  count instead of clipping.

### Playing it from a MIDI keyboard

An anachronism, stated as one: the Model D predates MIDI by thirteen years and has no socket for it.
What is faithful is the other end — a controller's three gestures are exactly the three the
instrument has, so nothing had to be invented about where a message goes.

| MIDI | Goes to |
|---|---|
| note on/off, any channel | the keys, for notes 29 to 72 (F1 to C5); anything outside is dropped rather than folded into range |
| pitch bend, 14-bit | the Pitch wheel, which is sprung and never stored in a patch |
| CC 1 | the Mod. wheel, which **is** part of a patch, so a controller moving it marks the draft unsaved exactly as dragging it on screen does |
| CC 120 / 123 | everything released; a note left sounding after a panic is the worst failure a synthesiser has |
| velocity | read only to tell a note on from a note off. The keyboard is not velocity sensitive, so how hard a key is struck is not information this instrument has anywhere to put |

The app carries a short version of this: **Playing over MIDI…** in the menu behind the person icon,
which leads with the step that looks like a fault. **[tools/MIDI.md](tools/MIDI.md) is the full
guide**: plugging a controller in, faking one with the IAC
Driver and the sender page, and playing a MIDI file so both hands are free for the panel. Start
there rather than here.

Access is asked for on the first key played, not on load: a browser wants a gesture behind the
request, and a permission prompt that greets somebody before they have touched anything is one they
have no reason to grant. A refusal is not an error — it means the screen and the typing keyboard are
how it gets played. A keyboard plugged in after the page is open still works, because the access
object says when its ports change.

### Hearing it

`tools/audio-check.html` answers what no unit test can. Run `bun run dev`, open
`/tools/audio-check.html`, and it renders the engine through an `OfflineAudioContext` and prints
what came out. Read `a4` against `a440Switch` first: the same pitch reached two ways, so if they
disagree the keyboard is in the wrong octave.

## Who may do what

Three vocabularies, deliberately unlike each other, all in `src/access/privileges.ts` so that the
server and the browser cannot disagree about what a name means.

<details>
<summary>The forks this design came to, and what was on the other side of each</summary>

Each of these was a real choice, and the rejected half is written down because the reason it was
rejected is the reason the current shape looks odd if you meet it cold.

- **A role is stored, rather than stamped out as grants.** Applying a role could have written one
  grant row per privilege. That makes the role a dead shortcut: change what `tester` means and
  nobody already marked one is affected. Stored, a role stays live.
- **Only `tester` is stored.** `member` was, briefly — every row then had to be backfilled correctly
  or the account had no privileges at all. `admin` was too, alongside `MOOG_ADMINS`, which gave one
  fact two sources: a column could go on claiming an administrator the environment had stopped
  naming, and the revoke masking it looked like tidy-up waiting to happen. Both are worked out now.
- **Overrides are a table, not a JSON column on `users`.** `settings.json` looks like the precedent
  and is the wrong one — it is justified by the server never reading inside it, and these are read
  on every request. `ratings` is the real precedent: a per-(user, thing) decision with a composite
  key. The table is also what allows one row to be written without sending the rest back.
- **A revoke beats everything, including `MOOG_ADMINS`.** The alternative — an env admin immune to
  revokes — would mean the person most likely to be testing what a member sees is the one person who
  cannot. The recovery path is protected at the point a revoke is *written* instead, which keeps the
  resolution order a rule without exceptions.
- **`AccessAdmin` is a prerequisite, not a second `needs` on each admin route.** Annotating routes
  would work until one was added without the annotation, which is the hole it closes; and routes are
  not the only place a privilege is asked about.
- **No router dependency.** react-router would bring `useBlocker`, nested layouts, loaders and
  route-level code splitting. Only the first had a use here, and it is ~40 lines.
- **Routes live in the path.** They lived in the fragment first, on the reasoning that moving them
  would drag every OAuth return URL along. That turned out to be four string literals, and the
  fragment was hiding a bug — see **Pages**.

</details>

A **privilege** is a thing the code can do — `AccessAdmin`, `AdminUsers`, `AdminTags`,
`AdminLayout`, `AdminPatches`, `StoreMidi`. Adding one is that file plus the route that asks for it:
never a migration.

A **role** is a named set of privileges, stored against a user. It is stored rather than
stamped out as individual grants because that is what keeps it *live*: changing what `tester`
means in code reaches everyone already marked a tester, with no write.

An **override** is one person's answer for one privilege, and beats the role either way.

**`tester` is the only role anybody is given.** The other two are facts rather than decisions, and
neither is ever written to a row:

- `member` is what every signed-in account is, applied at resolution rather than stored. It carries
  nothing today: signing in is not itself permission to do anything. The rung stays because it is
  where a privilege everybody should have would go, reaching every account without touching the
  database.
- `admin` comes from `MOOG_ADMINS` and nowhere else. Storing it as well gave one fact two sources,
  which is what let a column go on claiming an administrator the environment had stopped naming.
  Somebody who needs one administrative power without being an administrator is given that
  privilege, not the role.

A row that says `admin` is ignored rather than honoured: nothing writes one, and the resolution not
honouring it is what makes that a rule rather than a thing nothing happens to do.

**The roles are a ladder** — `member`, then `tester`, then `admin` — and each rung holds what the
rungs below it hold. `ROLE_LADDER` states that order, and each role lists only what it *adds*.
Re-listing an inherited privilege is how the two drift, so `addedBy()` derives each rung's own
contribution from `privilegesOf()` rather than reading the table a second time.

Today `member` adds nothing, `tester` adds `StoreMidi`, and `admin` adds the five administrative
ones. Keeping a file on the server is a tester's power rather than every account's: it is storage
somebody has to pay for, and the rung is what hands it to a group in one line instead of to each
person by hand.

The roles are code, so unlocking a feature takes a deploy either way. What the ladder buys is that
the deploy is **one line**: give it to `member` and testers and admins have it too, with no per-user
writes and no matching edit on the rungs above.

### The rule

```
roles   = member + stored tester + (admin, if MOOG_ADMINS names them, or sign-in is off)
base    = everything up to the highest rung held
granted = base ∪ explicit grants
final   = granted \ explicit revokes            // a revoke wins over everything
          minus anything whose prerequisite is not held
```

One function, `resolve()`, and nowhere else. A revoke still takes one privilege off an
administrator, which is what lets them see what everybody else sees. What a revoke cannot do is
close the way back in: the two doors cannot be taken from an address `MOOG_ADMINS` names, and that
is a refusal where a revoke is *written*, not an exception in the order above.

**`AccessAdmin` is a boundary, not a door.** Every other administrative privilege is conditional on
it — `REQUIRES` in the same file — and the condition is applied last, after grants and revokes, so
no single grant steps over it. Revoking it de-administers somebody *everywhere*: the pages stop
being drawn, the admin routes start refusing, and editing somebody else's patch stops working, all
from the one list every check already reads. Nothing stored changes, so putting the privilege back
restores the lot.

That condition lives beside the privileges rather than as a second entry on each admin route,
because a route that forgot the second entry is exactly the hole it closes — and the routes are not
the only place these are asked about.

With sign-in off there is one local user and no list to be on, so the **mode** is what makes it an
administrator — decided in `isEnvAdmin` alongside the list, rather than stored against that one
user. One fact, one source, in both modes.

### Names are stored now, so renaming one is not free

`user_privileges` stores privilege names and `users.roles` stores role names. Adding is still free.
**Renaming is not**, and it fails in the dangerous direction: an unknown *grant* row fails closed
(access lost, safe), but an unknown *revoke* fails open — the gate exists under the new name while
the revoke still names the old one. `test/privilege-names.lock.json` is add-only and pins every name
ever shipped; when it fails, restore the old name. An override naming something this build does not
know is kept, never acted on, and shown on the People page.

### If nobody can administer users any more

Three rules stop it, all enforced where a write happens: you cannot revoke `AccessAdmin` or
`AdminUsers` from **yourself**; neither can be revoked from an address listed in `MOOG_ADMINS`; and
no write may leave **zero** accounts holding `AdminUsers` — counted again inside the write's own
transaction, because two administrators revoking each other at the same moment both pass a check
taken beforehand.

If it happens anyway, the break-glass is the data:

```sql
delete from user_privileges where privilege = 'AdminUsers';
```

against `moog.db` on the volume. Restarting with no `MOOG_OAUTH_CLIENT_ID` also brings back the
`off`-mode local admin.

### Where the check happens

The server decides; the browser only draws. Every route declares what it needs in the table, and
`dispatch` checks it before the handler runs, so a route that forgets to ask cannot exist — asking
is not the handler's job. 401 when there is nobody to refuse, 403 when there is.

On the client, `/api/session` carries the privilege list and two guards read it:

```tsx
<Can privilege={PRIVILEGE.StoreMidi}><Button …/></Can>
```

`Can` hides a control, and renders nothing by default: a button that is not for you is best simply
absent, and the route behind it refuses regardless. `RouteGuard` stands in front of a whole page and
says no out loud, because a page is reachable by typing its address and an empty page whose every
button is refused reads as broken rather than shut.

A privilege the browser cannot name is dropped when the list is read, so a server one version ahead
can never widen what this build draws.

The browser's list is filled once, at mount, so a privilege changed under somebody signed in does
not move until they reload — their buttons stay drawn and the route answers 403. Rather than poll
for a change that almost never comes, a refusal asks for the session again, which makes the stale
page correct itself; and an administrator editing their own access refreshes straight after the
write, since otherwise the page would be lying about the person pressing the buttons.

### Administering people

`/admin/users` lists everyone with an account, searchable, with what each has made, when they
joined and when they were last seen. Opening one shows every privilege in words, with the stored
name beside it and the long description behind an info icon.

**Each privilege has one control with three positions**, because there are three answers and only
three: this account is handed it, this account is refused it, or neither and the roles decide. A
revoke is its own position rather than the absence of a grant, since it outlives a role being added
later, and going back to the roles is a position rather than a button because that is what deleting
the row means. Which of the three a row sits in is an attribute on the row, and the stylesheet
reads that, so the state is in the DOM rather than inferred from a colour.

Each change writes on its own: there is no Save, because one click puts it back, and no whole-set
write, because that would delete an override naming a privilege this build has never heard of.

**A stored row says who decided it and when.** `user_privileges` has carried `at` and `by_user_id`
since the schema was written and every write fills them, so the one audit trail the app has was
there all along with nothing reading it back. The stamp is drawn only where there is a row to
stamp: a role answering has nobody and no moment to name. A null actor is both a row the install
wrote itself and one whose author has since been deleted, because `by_user_id` is
`on delete set null` and nothing can tell the two apart, so it reads as not recorded rather than
picking one. An override naming a privilege this build does not know carries the same stamp, which
is the row where it matters most: nothing here can say what it means, so who wrote it is all there
is to go on.

The deciding account's name comes from a second repository method rather than a join added to
`overridesOf`, which runs on every authenticated request through the viewer lookup: one
administration page asks who decided something, and every page load would otherwise pay for it.

It is its own route with its own privilege rather than nesting behind `AccessAdmin`, so the two can
be held apart — which is what the rules above assume.

### The operations page

`/admin/ops` behind `AdminOps` says what this server has done to itself since it started: the last
backup and whether it worked, the last sweep of the trash and what it measured against, the bank it
seeded, and the limits it holds people to with the variable that sets each one. All of it was real
already and visible only in the container's log, which made "did last night's backup work" a
question answered over ssh.

**The hard part is where the facts come from.** `serve.ts` runs the backup and the purge;
`createApi` is shared with the Vite plugin, which runs neither. So `server/ops.ts` holds both the
schedule and the record of what it did, and `createApi` takes that record as an option exactly as
it already takes `limits` and `identity`. It is constructed rather than imported: `createApi` is
called several times inside one test file, and a module singleton would leak one test's backup into
the next one's assertions, which is the trap `createRateLimiter` already avoids the same way.

`runMaintenance` and `scheduleMaintenance` are separate exports because a test that called the
scheduler would leave a live `setInterval` holding the suite open.

**Under `bun run dev` the page says nothing here takes backups**, in words, rather than reporting a
backup of none: a zero reads as a run that copied nothing, which is a different and worse thing to
believe. The bank and the limits are real in both, because both entry points seed and both read the
environment. The page also says the timer runs from process start rather than at a wall-clock hour,
because that is what `setInterval` does and an operator expecting 03:00 would be wrong.

The size counts the `-wal` file beside the database: in WAL mode the main file stays one page until
a checkpoint, and a fresh install otherwise reports 4 KiB while its own backup is 139 KB.

**Credentials are not on it.** The limits are configuration worth seeing; `MOOG_OAUTH_CLIENT_ID`,
the secret and the contents of `MOOG_ADMINS` are not, and a page that showed them would be a new
reason to guard the page rather than a window onto the housekeeping. `/health` stays open for the
container's healthcheck and gains none of this.

### Arrangements are the first thing a privilege gates

`StoreMidi` is what lets somebody keep a MIDI file together with the sound put on each of its
parts, and it sits on the `tester` rung rather than `member`. Save and Open appear on the Play MIDI
page for whoever holds it, and every `/api/arrangements` route declares it — there is no half of
that resource that is open.

**A part points at a patch by id rather than carrying a copy.** Editing a patch then changes what
the arrangement plays, which is what somebody who tweaked a bass and pressed play expects. The cost
is that a deleted patch leaves a part silent, so the name chosen at the time is stored beside the id
purely so the page can say which sound has gone rather than loading a part quietly undressed.

A part naming a patch its owner may not see is **dropped on save rather than refused**: the sounds
are references, and refusing the whole save would make one missing sound cost the other fifteen.
That check is the same question the library answers — mine, published, or from the bank — so saving
an arrangement cannot become a way to keep hold of a patch that was visible for a moment.

Ownership is not a route check. An arrangement belongs to exactly one person and every query is
scoped to them, so a stranger's id is simply not found and there is nothing to confirm the existence
of.

Saving writes over the arrangement that was opened and creates otherwise, because only the server
mints an id — the same rule the patch editor follows, and what stops every save becoming another
copy.

## Pages

`src/navigation/routes.ts` is one table of pages, each with the privilege it needs, matched against
the **path**. `pushState` fires no event of its own, so `navigate` tells the store directly and
`popstate` covers the back button — both through the same listener set, which is what makes a press
of Back indistinguishable from a navigation to anything reading the address.

This works because the server hands back the app for an address it does not recognise — *"anything
else is a client route"* in `serve.ts`, and Vite in development. That fallback is what a fragment
would otherwise have been buying, and it was already there.

`resolve` cuts the query off before matching: a query belongs to whoever reads it, like the
`?error=` a failed sign-in comes back with, and never to the match. A link bookmarked when the
routes lived in the fragment is rewritten once by `adoptLegacyHash` before anything renders; a
fragment that is not a path is left alone, because that is somebody's anchor.

The matcher captures `:name` segments and `useParams()` hands them over. `/patch/:id` is the one
page that takes one, and it was a row in the table rather than a rewrite, which is what that
machinery was for.

A route's declared path is `/patch/:id` and the address is `/patch/midnight-funk`, so anything
carrying somebody back to where they were wants the second. `returnToFor` in `session/session.ts`
is that distinction named once, because handing the first to a sign-in sends them to the home page
instead and nothing downstream can tell.

There is no router dependency. What one would buy here is `useBlocker`, nested layouts, loaders and
route-level code splitting, and only the first had a use — it is `useNavigationBlock` now.

### The patch sheet

`/patch/:id` is the one page with an address per thing it shows, and it is what makes a patch
something you can send somebody. It **shows** a patch rather than editing one: arriving changes no
state at all, so a link opened by somebody halfway through a patch of their own cannot cost them
the draft they had going. `/editor` stays what it was, the one unsaved draft.

That division is the whole reason the sheet is not simply the editor at another address. As the
editor, the address would have to be rewritten twice for a single act, since a factory patch opens
as a copy with no stored id and saving that copy mints a new one, and a press of Back landing
between the two would have to decide whether to reload a patch over a dirty panel.

**The panel on it is frozen, and still plays.** `Panel` takes `readOnly`, and what it freezes is
what the patch records, which is `isRecalled`: a frozen control is handed a no-op and wrapped in an
`inert` span at `display: contents`, so freezing costs no layout and no control component knows the
sheet exists. The output levels describe the room, the pitch wheel cannot hold a position, and the
keyboard is a decoration, so none of the three is in a patch and none of them is frozen. The
keyboard carries its own audio, so drawing the panel is what makes a link sound.

Unknown, somebody else's private one, and deleted are **one message**, because the server refuses
to tell them apart: a 403 would confirm that an id exists. Saying more would invent a distinction
it withheld.

**The notes are drawn under the panel**, where the manual's own sheets print their Notes box, and
in the editor under the same panel. `PatchNotes` is in `components/library/` beside `PatchBar`, for
the reason the header is there: both are the patch's own fields drawn around the panel.

They are deliberately **not** on `LibraryEntry`. Notes are the one field besides `values` with no
natural size, several of the 35 that carry one run to multiple sentences, and a row is one line,
where a truncated note reads worse than none. So they are read where a whole patch is already
loaded, which costs no request and no payload; `test/libraryIndex.test.ts` fails if the summary
grows them. A patch with none draws nothing rather than an empty box.

Opening a row used to load the patch and adopt it *before* navigating, and `navigate` is what asks
about an unsaved draft, so answering Cancel left the library showing with the draft already gone.
`navigate` answers whether it went, and the editor button adopts only once it has.

**Print is a button on the sheet**, and `src/print.css` is the whole of what it needs. That
stylesheet is global rather than a module because almost everything printing does is to elements
the sheet does not own: the nav, the preview banner, the file still playing, the bar's buttons, the
panel checklist and a page's alerts all wear `data-print="off"` and go on one selector, which keeps
what stays off the paper a list in one file instead of a rule per component. The patch's name is
not one of them: on paper it is the sheet's title.

The scale is the part a stylesheet cannot reach. `FitToWidth` writes the panel's scale as an
*inline* transform measured against the window, and a `ResizeObserver` callback is delivered at the
end of a frame, which is after `print()` has taken its snapshot. So the sheet printed at whatever
the screen last produced: half again wider than the page from a 1680px window, two thirds of its
width from a 900px one. The panel is therefore rescaled for the paper synchronously inside
`beforeprint`, and by the `matchMedia('print')` change event, which is how Safari announces the
same thing; `afterprint` puts the window's measurement back. `src/components/printSheet.ts` holds
the page box, A4 landscape with 10mm margins, and `test/printSheet.test.ts` reads the `@page` rule
off disk so that the stylesheet and the constants cannot drift apart. Paper is a value declared
here, not geometry recovered from a scan.

**The panel prints as it is drawn**, dark, with `print-color-adjust: exact` because Chrome drops
background graphics by default and a panel of white ink on a dropped black field prints nothing at
all. The manual's own sheets are line art on white, and matching them would mean re-pathing artwork
that is lifted verbatim.

**A sheet is one page**, which is what a patch sheet is: the manual prints two filled-in ones to a
page. That takes fitting the panel to the page rather than to its width. Fitted across alone it
came out 533 pixels tall in the 718 an A4 landscape page has, which leaves the Notes box nothing,
and `break-inside: avoid` then moved the whole box onto a second sheet: two pages for the 35 of the
44 patches in `bank/` that carry a note. So `printScale` answers for one dimension at a time and
the panel takes the smaller of the two, which puts Midnight Funk at 0.41 instead of 0.48, still far
larger than the manual draws the instrument.

How much room is left is a question only the page can answer, since it depends on how many rows of
chips and how many lines of note that patch has, so `PatchPage` measures it and `FitToWidth` asks
at the moment of printing. It measures at the *paper's* width, briefly setting the column to it,
because `beforeprint` runs on the layout the window has: a note that takes two lines in a 1680px
window may take three across a 1047px page, and a sheet measured at the window's width is one that
fits until somebody prints it from a large monitor. Where the rest of the sheet has taken the whole
page the height drops out of the decision rather than scaling the panel to nothing.

### The page nav

`PageNav.tsx` is the only way to any page, and it is one nav in two placements: a rail down the left
of a window with room for one, a bar across the top of a window without. The same rows in the same
order either way; what the placement changes is the direction they run in, which is the stylesheet's
business. A route is in it by carrying a `rail` label, and that label is a single word rather than
the route's title: the rail is as wide as its widest label, and "Patch library" over two lines is
what a title would cost. The title is still what the row is named to a reader, so dropping the words
takes nothing with it.

`navPlacement.ts` decides between the two and holds the one width the decision turns on: under
900px a window cannot spare 96px of itself for a rail, so the bar goes on top whatever anybody has
chosen. It is a media query read through `useSyncExternalStore` rather than a resize listener, so
the first render already knows (a rail drawn for one frame on a phone is the page reflowing under
somebody's thumb), and the nav moves as a window is dragged across the width rather than waiting for
a reload. The stylesheet has a second query, at 560px, and it is about a bar that is already up: the
words come off the rows, the glyphs stay, and a tooltip and the row's own name carry what they said.

Somebody who wants the bar on a wide screen too asks for it on the preferences page, and
`storage/deviceNav.ts` keeps the answer in `localStorage` beside the folded rail. Only the choice is
kept, never what is on the screen: a narrow window puts the bar up whatever is stored, so writing
"rail" on a phone would be recording a layout it cannot have. The bar is `position: sticky`, which
is the point of asking for it: the way to every other page stays under your thumb down a long
library.

Settings is not a row in that table. It is drawn from the first administration page this account can
open, because the administration privileges are held independently — somebody may keep the user list
without holding the tag page — and it is absent where there is none, which is the same rule the
account menu followed: a row everybody could see would be a door most people find locked.

Folding leaves the glyphs and takes the words rather than taking the rail away altogether. A rail
that could be dismissed entirely needs a second control to bring it back, and there is nowhere left
to put one. Whether it is folded is `storage/deviceRail.ts`, in `localStorage` rather than the
`sessionStorage` a previewed skin uses: it is how somebody wants their window laid out, not
something they are in the middle of trying. The bar has no fold and draws no arrow for one: its rows
are a glyph and a word on a single line, and a narrow window takes the words itself.

The home page at `/` is a placeholder for a dashboard. It is the address the app opens at and the
one an unrecognised address falls back to, so it says what the pages are rather than being blank —
but it holds nothing of its own yet. It is not a row: the mark at the head of the nav goes there,
which is where a logo already takes everybody who presses one, and a row as well would be two ways
to the same page an inch apart. `HOME_ROUTE` is what the mark aims at, named separately from
`DEFAULT_ROUTE` although they are the same page today — one is where the logo leads and the other is
where an unrecognised address lands.

The mark is two drawings. `public/patchdb.svg` is the lockup — the logo with PatchDB under it — and
it is what the rail shows unfolded and what the sign-in page shows. `public/logo.svg` is the logo on
its own, and it is what the rail shows folded and what the bar shows at any width: the name is a
word like any other, and at 60px, or in a bar barely taller than that, the lockup would be a
wordmark eight pixels tall. Both are named PatchDB to a reader, so the heading reads the same
whichever is up.

Both draw the logo whole, tile and all, rather than lifting the keys out of it. The page does not
supply a backdrop for the mark any more than a launcher does — the logo is a tile with keys on it,
and a page showing only the keys would be showing a different mark from the one in the tab beside
it. `public/logo.svg` is a copy of `reference/logo.svg` made by `make-icons.ts`, two names for one
drawing for the same reason `logo.png` is not `icon-512.png`: the day an icon cut for a launcher
wants to differ from a mark drawn on a page, the rail should not have to be re-pointed.

Both are drawn through an `<img>` rather than inlined like the glyphs. They carry gradients, and a
gradient's id is document-global: inlined in two places those ids would collide, and the second mark
would be painted with the first one's fill. An external file is its own document, so the id stays
inside it. Neither `.logo` rule rounds its corners, and now that the page draws the tile that is a
decision rather than a non-question: the tile's corners are already curved in the path, so a radius
on the box would cut a second curve inside the first.

The glyphs are inline components in `railIcons.tsx`, not `*.svg?react` imports, although `svgr` is
configured. svgr runs in Vite and not in Bun, so an imported file would be a component the suite
cannot render — and the rail is the part of the app with no other way to be tested. The paths are
the exports in `reference/` verbatim; the only edit is the fill, which is `currentColor` so one rule
lights the row you are standing on.

### Preferences

`/preferences` is what somebody sets for their own screen, as against the administration pages,
which are what somebody sets for everybody. It needs no privilege and it is not a row in the nav: it
is opened once and left, so it hangs off the account menu where the rest of what belongs to a person
already is. Nothing on it reaches the server: these are choices about a browser, and the browser is
where they are kept.

It says when the window is too narrow for what was chosen, because choosing the rail on a phone
changes nothing on the screen, and a setting that appears not to work reads as a broken setting.

### Leaving a page with unsaved changes

`beforeunload` covers closing the tab and reloading, and a move between pages is neither, so the
editor holds a blocker while its draft is dirty. One at a time and registered at the module rather
than checked at each call site: five places navigate, and a sixth would not know to ask.

It asks with the app's own dialog rather than `window.confirm`, which is the same reason
`useConfirm` exists at all — and `beforeunload` has to make do with wording the browser chooses,
while this does not.

**The back button is the awkward half.** `popstate` arrives *after* the browser has moved, so
refusing one means pushing the old address back rather than preventing anything. That adds a history
entry instead of removing one; the alternative is a page whose address disagrees with what it is
showing, which is worse.

## The server

Three layers, and a rule for which one a thing belongs in.

**Repositories** are the SQL. Rows in, rows out, one module per table group. Whether a viewer may
see a row is not their question — a repository that also refused would be a second place for the
rules to live.

**Services** hold the rules, and exist only where there are rules: who may write a patch, what a tag
may be called. A route with no rules of its own reads its repository directly rather than going
through a service that would only forward the call, which is why there is no library or settings
service.

**Routes** are a table of `{ method, path, needs, handle }`. A table rather than a run of
`if (resource === …)`, so what a route needs is declared next to the route instead of being the
first few lines of its handler.

`api.ts` is wiring: it decides the order of the three things that happen in front of every route —
where the request came from, who is asking, and how often they have asked — and then dispatches.
Sign-in is not a table route: it sets cookies, talks to Google and has to be reachable by somebody
with no session yet, so it runs before a viewer is even looked up.

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

## The factory bank

**A factory patch is a patch.** Same table, same schema, same `GET /api/patches/:id`, and the
library draws it from the same `listVisible`. Two things differ: it is addressed by the `slug` it is
filed under in the repo rather than by a minted uid, and `mayWrite` refuses it for everybody. There
is no second store, no second route and no second word for it — the vocabulary used to say
"preset", and that was the only thing suggesting it was a different kind of thing.

Opening one produces a fresh unsaved patch with a new id, so saving afterwards can never write back
over it.

**The bank is seeded, not synced.** `loadFactory` writes a file into the database only when that
slug is not there yet; a row it already holds is left exactly as it is. That is what makes a factory
patch editable at all — the rows are the live bank, so a correction has somewhere to live that a
restart will not undo. It also means one that was retired stays retired rather than walking back in
because its file is still in the image.

**A file never reaches a row that already exists.** A database holding a slug never hears about a
change to its file, and there is no flag, route or environment variable that pushes one through. A
file that disagrees with the database is the file being out of date: the rows are the bank, and an
administrator's correction is the only thing that changes one. Anything offering to put the repo's
copy back would only ever be a way to discard those corrections by accident.

`BANK_REFRESH` in `server/factory.ts` is the single exception, and it is spent. It is a number the
database remembers having done, raised to 1 when the bank was re-transcribed from the manual and
every row in every deployment was wrong, so that one correction reached rows that already existed
without anybody having to remember a flag at the right deploy. It is not raised again, and
`test/factoryBank.test.ts` fails if it is.

That leaves `bank/` as two things and not a third: what a **fresh** database is built from, and the
record of what was transcribed. It is not a way to edit a bank that is running, and editing a file
there will not change one.

A file in `bank/` is one patch, named after the slug inside it, and a control you have no real value
for is **omitted** rather than guessed — an omission is honest and a guess is not:

```jsonc
{ "slug": "midnight-funk", "name": "Midnight Funk", "notes": "", "values": { "<controlId>": <value> } }
```

**An omission means Init, on purpose.** It is a live reference to the registry default, so the
blank panel and the factory bank are the same dial: move a default in `panel.ts` and every patch
that never specified that control moves with it. That is the intended reading — a sheet that does
not mention Keyboard Control 1 describes a sound where it sat wherever Init leaves it, not one
asserting a value nobody wrote down.

### Where the 44 come from

The **Patch Sheets** chapter of the Minimoog Model D manual, pages 55 to 76 — two filled-in sheets
a page, exactly 44. They were transcribed by hand once from a source nobody recorded, and that
transcription was wrong: Midnight Funk had Oscillator-1 at 16' sawtooth, volume 8, where the sheet
plainly draws 2', narrow pulse, pointer straight up.

The sheets are vector drawings, so the settings are geometry and were read back rather than
estimated — the same reason `tools/measure-artwork.py` exists for the panel. A knob comes from the
angle of its pointer through the same −150..+150 sweep `ContinuousKnob` renders with, so a stored
value redraws where it was read; a rotary selector from which of six detents the callout rings; a
switch from which of its two cells is filled; Attack and Decay back through `CONTOUR_TIME_MS`. The
marks are drawn in PANTONE 151 U, which is what separates a setting from the printed panel beneath
it, and each sheet is normalised onto its own drawn extent because the declared boxes differ by 24
units between recto and verso.

Three things the sheets mark and the files do not carry. **Output Volume and Phones**, because a
patch does not recall the volume of the room it is played in. **The Mod wheel**, which is drawn as
an arrow up the slider rather than a handle at a height — that is "move this while you play", an
instruction and not a setting, and the notes say so in words. And **anything left unmarked**, which
is the sheet declining to set it.

Each sheet's Notes box is the patch's `notes`; 35 of the 44 carry one.

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

The hand-drawn exports are in `artwork/`, and its README names what was taken from each drawing and
where that geometry lives now — including the three nothing is taken from any more, which are kept
because a claim of "lifted verbatim" that cannot be checked against the drawing is just a claim.
Reuse the paths verbatim and change only grouping and colour references.

The rail's glyphs sit beside them rather than in `artwork/`, which is the panel's: they are the
navigation's drawings, and `side-rail-design.png` is the design they were cut from.

### The icons

`logo.svg` is the logo as drawn, and everything else comes out of it. It arrives as a finished tile
— the gradient square, the dark panel inset in it, and the keys — rather than as the mark alone, so
it is the export verbatim and nothing in it is composed here. Everything in `public/` that a
browser, a dock or a launcher asks for comes out of it and `icon-maskable.svg` beside it by
`bun tools/make-icons.ts`, which drives headless Chrome — nothing else on a machine here rasterises
SVG, and a dependency that did would be a rasteriser in every install of the app for a script run a
few times a year. Run it when either source changes; the PNGs are committed, because the build
serves `public/` as it stands and a deploy machine has no browser.

The tile goes everywhere the logo goes, a page as much as a launcher: it is what the gaps between
the keys are drawn against, and a mark that borrowed the page's black for them would be one mark on
a dark page, another on a light one, and a third in the tab beside them. The maskable drawing is the
only one that departs from the artwork, and it differs twice over — both of them what maskable
means: a plain square, because a launcher cuts its own shape and the
drawn tile's rounded corners under a circle leave transparent slivers; and everything inside it at
80% of its drawn size, so it stays inside the safe zone a mask is guaranteed to keep. The panel's
rounded corner reaches 498 units from the centre against that zone's radius of 409.6, so at full
size a round launcher shaves the panel and the outer keys with it.

The two that place the artwork rather than copying it — the maskable tile and `public/patchdb.svg`,
which stands the logo over the wordmark — keep the paths and the gradients in the coordinates they
were drawn in and move them with a transform. `userSpaceOnUse` resolves against the space the
gradient is *referenced* from, which is inside that transform, so the 0-to-1024 run is carried onto
the artwork by the same scale. Rewritten into the destination's own coordinates, as looked obvious,
the mark came out flat blue.

`favicon.ico` is packed by the same script: a header, one directory entry per size, and a whole PNG
per entry rather than a bitmap. Every browser that still asks for an `.ico` by name has read
PNG-in-ICO for fifteen years, and the bitmap form would mean writing a BMP encoder and its
upside-down AND mask.

`public/icon.svg` and `public/logo.svg` are not rasterised at all — they are the drawing itself,
copied. A browser that takes an SVG favicon draws it at whatever size it wants instead of picking
the nearest bitmap, and the folded rail and the top bar draw the same file at 34px, so between
them they are the
only places the artwork reaches a screen as it was drawn. The script does the copying rather than
anyone doing it by hand: `public/` is what is served and `reference/` is not, and a copy made by
hand is a drawing that drifts from the one every PNG beside it was baked from.

Its `<link>` in `index.html` and the `sizes="any"` on the `.ico` link above it are one decision, not
two. Chromium prefers an `.ico` to an SVG unless the `.ico` states a size, so with either half
missing Chrome renders a 32px bitmap where it could be drawing the artwork — and for the same
reason the SVG's own link carries no `sizes` (crbug.com/1162276). Safari reads no SVG favicon at
all, which is what the two PNG links are still there for.

The two `.mid` files are there to be opened by the MIDI page, and are what its parsing was checked
against: `Wily1st1.mid` names its parts and carries six tracks of text that play nothing, and
`Silius1.mid` names none of them. Between them they cover both of the cases the page has to draw.
Neither is ours — each credits its author inside the file — and neither is a test fixture: the
parser's tests build files byte by byte, so nothing breaks if these ever have to go.

Two things learned the hard way that still apply when control components arrive:

- SVG gradient and filter ids are document-global. Shared `<defs>` in one component, not per knob,
  or they collide.
- A knob is roughly 40 SVG nodes. Memoize the component and keep its props primitive, or dragging
  one knob re-renders every other.

## Testing

`bun test` needs no extra dependencies. `localStorage` does not exist in Bun's runtime, which is
useful — it forces the storage adapter to take its backend by injection instead of reaching for a
global.

Tests live in `test/` and have their own project, `tsconfig.test.json`, which the root config
references so `tsc -b` typechecks them alongside `src/` and `server/`. It is the app config plus
`bun` and `node` in `types`, which is what makes `bun:test` and `node:fs` resolve. Bun still runs
the suite type-stripped, so `bun run build` is where a broken test type shows up.

`test/fixtures.ts` defines two **fake** control types. They exist to prove the registry, resolver
and importer are generic over control types. Neither is a proposal for a real Minimoog control, and
nothing in `test/` ships.

## Attribution

Almost none of the reference material is ours. The scans under `reference/` are pages of Moog's
Minimoog Model D owner's manual, kept because the geometry in `measurements.md` is recovered from
them and a measurement whose source has gone is a number nobody can check. The 44 names and
performance tips in `bank/` are that manual's patch sheets, and since the re-transcription the knob
values are too. The two `.mid` files each credit their author inside the file.

The instrument, the panel layout and the marks "Moog" and "Minimoog" are Moog Music's. PatchDB is an
editor for the instrument and is not from, endorsed by or affiliated with them. What it takes from
the manual is the measurements and the patch sheets, which is the part an editor cannot invent.

**This is carried over unsettled from the proof of concept, and it is what to settle before the app
is somewhere public.** The layout and the code are ours to build; the scans and the written
patch-sheet material are not. A deployment anybody can reach is where that stops being a private
question, and the app says none of the above on any page it draws.
